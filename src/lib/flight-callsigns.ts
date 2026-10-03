import { randomUUID } from "node:crypto";
import { normaliseApprovedBaGroupCallsign, toBritishAirwaysCallsign, toBritishAirwaysFlightNumber } from "@/lib/ba-flight-identifiers";
import { getStaffState, saveStaffState, type FlightCallsignMapping } from "@/lib/staff-store";

export type CallsignConfidence = "verified" | "historical" | "inferred";
export type CallsignSource = "vatsim" | "schedule" | "observed_real_operation" | "historical_db" | "manual" | "fallback";

export type FlightCallsignResolution = {
  commercialFlightNumber: string;
  operatorIcao: FlightCallsignMapping["operatorIcao"];
  callsign: string;
  telephony: FlightCallsignMapping["telephony"];
  spokenCallsign: string;
  confidence: CallsignConfidence;
  source: CallsignSource;
  verifiedAt: string | null;
  mappingId: string | null;
};

type ResolveFlightCallsignInput = {
  commercialFlightNumber: string;
  departureIata?: string | null;
  arrivalIata?: string | null;
  operatingDate?: string | null;
  /** A linked VATSIM pilot's live callsign. Never supply an unlinked network callsign here. */
  vatsimCallsign?: string | null;
  /** Callsign copied from a checked timetable record at booking time. */
  routeCallsign?: string | null;
  routeVerifiedAt?: string | null;
  routeSource?: Exclude<CallsignSource, "vatsim" | "fallback">;
  routeConfidence?: CallsignConfidence;
};

type NewCallsignMapping = Omit<FlightCallsignMapping, "id" | "flightNumberNumeric" | "operatingCarrier" | "operatorIata" | "operatorIcao" | "telephony" | "createdAt" | "updatedAt"> & {
  id?: string;
  operatingCarrier?: string;
  operatorIata?: string;
  telephony?: FlightCallsignMapping["telephony"];
};

const operatorDetails: Record<FlightCallsignMapping["operatorIcao"], Pick<FlightCallsignMapping, "operatingCarrier" | "operatorIata" | "telephony">> = {
  BAW: { operatingCarrier: "British Airways", operatorIata: "BA", telephony: "SPEEDBIRD" },
  SHT: { operatingCarrier: "British Airways Shuttle", operatorIata: "BA", telephony: "SHUTTLE" },
  CFE: { operatingCarrier: "BA CityFlyer", operatorIata: "BA", telephony: "FLYER" },
  EFW: { operatingCarrier: "BA Euroflyer", operatorIata: "BA", telephony: "EUROFLYER" },
};

function cleanFlightNumber(value: string) {
  const flightNumber = toBritishAirwaysFlightNumber(value);
  return /^BA\d{1,4}$/.test(flightNumber) ? flightNumber : null;
}

function flightNumberNumeric(flightNumber: string) {
  return flightNumber.replace(/^BA/, "");
}

function cleanAirport(value: string | null | undefined) {
  const airport = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(airport) ? airport : null;
}

function cleanDate(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function operatorForCallsign(callsign: string): FlightCallsignMapping["operatorIcao"] | null {
  const prefix = callsign.slice(0, 3) as FlightCallsignMapping["operatorIcao"];
  return prefix in operatorDetails ? prefix : null;
}

function spokenSuffix(callsign: string) {
  const suffix = callsign.slice(3).split("").map((character) => /\d/.test(character) ? character : ({ A: "ALFA", B: "BRAVO", C: "CHARLIE", D: "DELTA", E: "ECHO", F: "FOXTROT", G: "GOLF", H: "HOTEL", I: "INDIA", J: "JULIET", K: "KILO", L: "LIMA", M: "MIKE", N: "NOVEMBER", O: "OSCAR", P: "PAPA", Q: "QUEBEC", R: "ROMEO", S: "SIERRA", T: "TANGO", U: "UNIFORM", V: "VICTOR", W: "WHISKEY", X: "X-RAY", Y: "YANKEE", Z: "ZULU" } as Record<string, string>)[character] ?? character);
  return suffix.join(" ");
}

function dateMatches(mapping: FlightCallsignMapping, operatingDate: string | null) {
  if (!operatingDate) return true;
  return (!mapping.validFrom || operatingDate >= mapping.validFrom) && (!mapping.validTo || operatingDate <= mapping.validTo);
}

function mappingMatches(mapping: FlightCallsignMapping, flightNumber: string, from: string | null, to: string | null, operatingDate: string | null) {
  return mapping.commercialFlightNumber === flightNumber &&
    (!from || mapping.departureIata === from) &&
    (!to || mapping.arrivalIata === to) &&
    dateMatches(mapping, operatingDate);
}

function toResolution(callsign: string, source: CallsignSource, confidence: CallsignConfidence, verifiedAt: string | null, mappingId: string | null, commercialFlightNumber: string): FlightCallsignResolution {
  const operatorIcao = operatorForCallsign(callsign) ?? "BAW";
  const telephony = operatorDetails[operatorIcao].telephony;
  return { commercialFlightNumber, operatorIcao, callsign, telephony, spokenCallsign: `${telephony} ${spokenSuffix(callsign)}`, confidence, source, verifiedAt, mappingId };
}

function mappingSort(left: FlightCallsignMapping, right: FlightCallsignMapping) {
  const confidenceOrder: Record<CallsignConfidence, number> = { verified: 0, historical: 1, inferred: 2 };
  return confidenceOrder[left.confidence] - confidenceOrder[right.confidence] ||
    (right.callsignLastVerifiedAt ?? "").localeCompare(left.callsignLastVerifiedAt ?? "") ||
    right.updatedAt.localeCompare(left.updatedAt);
}

export function normalizeCallsignMapping(input: NewCallsignMapping): FlightCallsignMapping {
  const commercialFlightNumber = cleanFlightNumber(input.commercialFlightNumber);
  const operationalCallsign = normaliseApprovedBaGroupCallsign(input.operationalCallsign);
  const departureIata = cleanAirport(input.departureIata);
  const arrivalIata = cleanAirport(input.arrivalIata);
  const operatorIcao = operationalCallsign ? operatorForCallsign(operationalCallsign) : null;
  if (!commercialFlightNumber || !operationalCallsign || !departureIata || !arrivalIata || !operatorIcao) {
    throw new Error("A BA flight number, valid BA Group operational callsign, and both IATA airports are required.");
  }
  const validFrom = cleanDate(input.validFrom);
  const validTo = cleanDate(input.validTo);
  const sourceValues: FlightCallsignMapping["source"][] = ["schedule", "observed_real_operation", "vatsim", "historical_db", "manual"];
  const confidenceValues: CallsignConfidence[] = ["verified", "historical", "inferred"];
  if (!sourceValues.includes(input.source)) throw new Error("Use a recognised callsign source.");
  if (!confidenceValues.includes(input.confidence)) throw new Error("Use verified, historical, or inferred callsign confidence.");
  if (validFrom && validTo && validFrom > validTo) throw new Error("The callsign valid-from date must not be after valid-to.");
  const now = new Date().toISOString();
  const details = operatorDetails[operatorIcao];
  return {
    id: input.id ?? randomUUID(),
    commercialFlightNumber,
    flightNumberNumeric: flightNumberNumeric(commercialFlightNumber),
    operatingCarrier: input.operatingCarrier?.trim() || details.operatingCarrier,
    operatorIata: "BA",
    operatorIcao,
    operationalCallsign,
    telephony: details.telephony,
    departureIata,
    arrivalIata,
    validFrom,
    validTo,
    source: input.source,
    confidence: input.confidence,
    callsignLastVerifiedAt: cleanDate(input.callsignLastVerifiedAt),
    lastSeenAt: input.lastSeenAt ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listFlightCallsignMappings() {
  return (await getStaffState()).flightCallsignMappings.map((mapping) => ({ ...mapping })).sort(mappingSort);
}

/** Upserts the dated mapping without deleting a different historical callsign. */
export async function upsertFlightCallsignMapping(input: NewCallsignMapping) {
  const mapping = normalizeCallsignMapping(input);
  const state = await getStaffState();
  const index = state.flightCallsignMappings.findIndex((item) =>
    item.id === mapping.id || (
      item.commercialFlightNumber === mapping.commercialFlightNumber &&
      item.operationalCallsign === mapping.operationalCallsign &&
      item.departureIata === mapping.departureIata &&
      item.arrivalIata === mapping.arrivalIata &&
      item.validFrom === mapping.validFrom &&
      item.validTo === mapping.validTo
    ));
  if (index >= 0) {
    const existing = state.flightCallsignMappings[index];
    state.flightCallsignMappings[index] = { ...mapping, id: existing.id, createdAt: existing.createdAt };
  } else {
    state.flightCallsignMappings.push(mapping);
  }
  await saveStaffState(state);
  return index >= 0 ? state.flightCallsignMappings[index] : mapping;
}

/** Resolves a dated operational callsign without ever presenting a fallback as verified. */
export async function resolveFlightCallsign(input: ResolveFlightCallsignInput): Promise<FlightCallsignResolution> {
  const commercialFlightNumber = cleanFlightNumber(input.commercialFlightNumber) ?? input.commercialFlightNumber.trim().toUpperCase();
  const vatsimCallsign = normaliseApprovedBaGroupCallsign(input.vatsimCallsign);
  if (vatsimCallsign) return toResolution(vatsimCallsign, "vatsim", "verified", new Date().toISOString(), null, commercialFlightNumber);

  const from = cleanAirport(input.departureIata);
  const to = cleanAirport(input.arrivalIata);
  const operatingDate = cleanDate(input.operatingDate);
  const mappings = (await getStaffState()).flightCallsignMappings
    .filter((mapping) => mappingMatches(mapping, commercialFlightNumber, from, to, operatingDate))
    .sort(mappingSort);
  const mapped = mappings[0];
  if (mapped) return toResolution(mapped.operationalCallsign, mapped.source, mapped.confidence, mapped.callsignLastVerifiedAt, mapped.id, commercialFlightNumber);

  const routeCallsign = normaliseApprovedBaGroupCallsign(input.routeCallsign);
  if (routeCallsign) return toResolution(
    routeCallsign,
    input.routeSource ?? "schedule",
    input.routeConfidence ?? "verified",
    cleanDate(input.routeVerifiedAt),
    null,
    commercialFlightNumber,
  );

  return toResolution(toBritishAirwaysCallsign(commercialFlightNumber), "fallback", "inferred", null, null, commercialFlightNumber);
}

/** Creates the versioned mapping that accompanies a checked timetable record. */
export async function captureCheckedRouteCallsign(input: { flightNumber: string; callsign: string | null | undefined; from: string; to: string; validFrom?: string | null; validUntil?: string | null; verifiedAt?: string | null; source?: FlightCallsignMapping["source"]; confidence?: CallsignConfidence }) {
  const operationalCallsign = normaliseApprovedBaGroupCallsign(input.callsign);
  if (!operationalCallsign) return null;
  return upsertFlightCallsignMapping({
    commercialFlightNumber: input.flightNumber,
    operationalCallsign,
    departureIata: input.from,
    arrivalIata: input.to,
    validFrom: input.validFrom ?? null,
    validTo: input.validUntil ?? null,
    source: input.source ?? "schedule",
    confidence: input.confidence ?? "verified",
    callsignLastVerifiedAt: input.verifiedAt ?? null,
    lastSeenAt: null,
  });
}
