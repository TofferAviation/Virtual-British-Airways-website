import type { AcarsSession } from "@/lib/acars-store";
import { BAV_NETWORK_ICAO_BY_IATA } from "@/data/bav-network-2026";
import { getPilotFlightPlan } from "@/lib/pilot-operations-store";

export type AcarsArrivalStatus = "arrived_as_planned" | "returned_to_origin" | "diverted" | "arrival_unverified";

export type AcarsArrivalResolution = {
  status: AcarsArrivalStatus;
  plannedStation: string;
  actualStation: string | null;
  detection: "simulator" | "pilot_declaration" | "position" | "unverified";
  message: string;
  /** A verified station is the only value that may update the fleet position. */
  canUpdateFleet: boolean;
};

const IATA_BY_ICAO = new Map(
  Object.entries(BAV_NETWORK_ICAO_BY_IATA).map(([iata, icao]) => [icao.toUpperCase(), iata.toUpperCase()]),
);

function normaliseAirport(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() ?? "";
  if (!/^[A-Z0-9]{3,4}$/.test(code)) return null;
  return IATA_BY_ICAO.get(code) ?? code;
}

function sameAirport(left: string | null | undefined, right: string | null | undefined) {
  const a = normaliseAirport(left);
  const b = normaliseAirport(right);
  return a !== null && a === b;
}

function distanceNm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const radians = (value: number) => value * Math.PI / 180;
  const earthRadiusNm = 3440.065;
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const a = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusNm * Math.asin(Math.sqrt(Math.min(1, a)));
}

function resolved(
  status: Exclude<AcarsArrivalStatus, "arrival_unverified">,
  plannedStation: string,
  actualStation: string,
  detection: Exclude<AcarsArrivalResolution["detection"], "unverified">,
): AcarsArrivalResolution {
  if (status === "arrived_as_planned") {
    return { status, plannedStation, actualStation, detection, canUpdateFleet: true, message: `Arrival verified at ${actualStation}.` };
  }
  if (status === "returned_to_origin") {
    return { status, plannedStation, actualStation, detection, canUpdateFleet: true, message: `Returned to ${actualStation}; planned arrival was ${plannedStation}.` };
  }
  return { status, plannedStation, actualStation, detection, canUpdateFleet: true, message: `Diverted to ${actualStation}; planned arrival was ${plannedStation}.` };
}

function unverified(plannedStation: string, message: string): AcarsArrivalResolution {
  return { status: "arrival_unverified", plannedStation, actualStation: null, detection: "unverified", canUpdateFleet: false, message };
}

/**
 * Resolves the station at which a flight actually finished. The planned route
 * is intentionally never used as a fallback: an uncertain arrival must not
 * place a registration at an airport where the simulator did not report it.
 */
export async function resolveAcarsArrival(session: AcarsSession): Promise<AcarsArrivalResolution> {
  const plannedStation = normaliseAirport(session.to) ?? session.to.trim().toUpperCase();
  const departureStation = normaliseAirport(session.from) ?? session.from.trim().toUpperCase();
  const snapshot = session.lastSnapshot;

  if (!snapshot) return unverified(plannedStation, "No final simulator position was received, so the aircraft station was left unchanged.");
  if (!snapshot.onGround) return unverified(plannedStation, "The final simulator report was airborne, so the aircraft station was left unchanged.");

  const simulatorAirport = normaliseAirport(snapshot.detectedAirport);
  if (simulatorAirport) {
    if (sameAirport(simulatorAirport, plannedStation)) return resolved("arrived_as_planned", plannedStation, plannedStation, "simulator");
    if (sameAirport(simulatorAirport, departureStation)) return resolved("returned_to_origin", plannedStation, departureStation, "simulator");
    return resolved("diverted", plannedStation, simulatorAirport, "simulator");
  }

  const declaredDiversion = normaliseAirport(snapshot.diversionAirport);
  if (declaredDiversion) {
    if (sameAirport(declaredDiversion, plannedStation)) return resolved("arrived_as_planned", plannedStation, plannedStation, "pilot_declaration");
    if (sameAirport(declaredDiversion, departureStation)) return resolved("returned_to_origin", plannedStation, departureStation, "pilot_declaration");
    return resolved("diverted", plannedStation, declaredDiversion, "pilot_declaration");
  }

  // A SimBrief briefing provides verified airport coordinates for the booked
  // origin and destination. This lets Ember identify a circuit back to the
  // departure airport even before a native adapter supplies airport codes.
  const briefing = await getPilotFlightPlan(session.bookingId, session.pilotId)
    .then((plan) => plan?.simbriefBriefing ?? null)
    .catch(() => null);
  const radiusNm = 3.5;
  const destinationLatitude = briefing?.destinationLatitude;
  const destinationLongitude = briefing?.destinationLongitude;
  if (destinationLatitude != null && destinationLongitude != null
    && distanceNm(snapshot.latitude, snapshot.longitude, destinationLatitude, destinationLongitude) <= radiusNm) {
    return resolved("arrived_as_planned", plannedStation, plannedStation, "position");
  }
  const originLatitude = briefing?.originLatitude;
  const originLongitude = briefing?.originLongitude;
  if (originLatitude != null && originLongitude != null
    && distanceNm(snapshot.latitude, snapshot.longitude, originLatitude, originLongitude) <= radiusNm) {
    return resolved("returned_to_origin", plannedStation, departureStation, "position");
  }

  return unverified(plannedStation, "Ember could not identify the arrival airport from the final simulator position, so the aircraft station was left unchanged.");
}

/** An auditable note that keeps the planned and actual airport visible in the PIREP without a schema migration. */
export function arrivalResolutionNote(resolution: AcarsArrivalResolution) {
  if (resolution.status === "arrived_as_planned") return "";
  return [
    "ACARS arrival reconciliation",
    `Planned arrival: ${resolution.plannedStation}`,
    `Actual arrival: ${resolution.actualStation ?? "Not verified"}`,
    `Outcome: ${resolution.status === "returned_to_origin" ? "Returned to departure airport" : resolution.status === "diverted" ? "Diverted" : "Arrival airport unverified"}`,
    resolution.message,
  ].join("\n");
}

export type PirepArrivalReconciliation = {
  plannedStation: string;
  actualStation: string | null;
  outcome: "returned_to_origin" | "diverted" | "arrival_unverified";
};

/** Reads the system-owned arrival note attached to an ACARS PIREP. */
export function parsePirepArrivalReconciliation(comments: string): PirepArrivalReconciliation | null {
  if (!comments.startsWith("ACARS arrival reconciliation\n")) return null;
  const plannedStation = /^Planned arrival: ([A-Z0-9]{3,4})$/m.exec(comments)?.[1] ?? null;
  const actual = /^Actual arrival: (.+)$/m.exec(comments)?.[1]?.trim() ?? null;
  const outcome = /^Outcome: (.+)$/m.exec(comments)?.[1] ?? "";
  if (!plannedStation) return null;
  if (outcome === "Returned to departure airport") return { plannedStation, actualStation: actual === "Not verified" ? null : actual, outcome: "returned_to_origin" };
  if (outcome === "Diverted") return { plannedStation, actualStation: actual === "Not verified" ? null : actual, outcome: "diverted" };
  return { plannedStation, actualStation: null, outcome: "arrival_unverified" };
}
