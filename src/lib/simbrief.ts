import { createHash } from "node:crypto";
import type { PilotBooking, SimbriefBriefing, SimbriefRoutePoint } from "@/lib/pilot-operations-store";
import { BAV_NETWORK_ICAO_BY_IATA } from "@/data/bav-network-2026";

const airportIcao: Record<string, string> = {
  ...BAV_NETWORK_ICAO_BY_IATA,
  LHR: "EGLL", LGW: "EGKK", LCY: "EGLC", OSL: "ENGM", JFK: "KJFK", LAX: "KLAX", PDX: "KPDX", DXB: "OMDB", SIN: "WSSS", HND: "RJTT", CPT: "FACT", SYD: "YSSY", SFO: "KSFO", SEA: "KSEA", IAH: "KIAH", JNB: "FAOR",
};

const aircraftIcao: Record<string, string> = {
  "Airbus A319": "A319",
  "Airbus A320": "A320",
  "Airbus A320neo": "A20N",
  "Airbus A321neo": "A21N",
  "Airbus A350-1000": "A35K",
  "Boeing 777-200ER": "B772",
  "Boeing 777-300ER": "B77W",
  "Boeing 787-8": "B788",
  "Boeing 787-9": "B789",
  "Boeing 787-10": "B78X",
  "Embraer E190": "E190",
};

const SIMBRIEF_WORKER_URL = "https://www.simbrief.com/ofp/ofp.loader.api.php";

function durationParts(duration: string) {
  const match = /(?:(\d+)h)?\s*(?:(\d+)m)?/.exec(duration);
  return { hours: String(Math.min(23, Number(match?.[1] ?? 0))).padStart(2, "0"), minutes: String(Math.min(59, Number(match?.[2] ?? 0))).padStart(2, "0") };
}

function departureParts(departure: string) {
  const [hours = "00", minutes = "00"] = departure.split(":");
  return { hours: hours.padStart(2, "0"), minutes: minutes.padStart(2, "0") };
}

function simbriefDate(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${String(parsed.getUTCDate()).padStart(2, "0")}${parsed.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }).toUpperCase()}${String(parsed.getUTCFullYear()).slice(-2)}`;
}

export function getSimbriefCodes(booking: PilotBooking) {
  return { origin: airportIcao[booking.from], destination: airportIcao[booking.to], aircraft: aircraftIcao[booking.aircraft] };
}

function buildSimbriefDispatchFields(booking: PilotBooking, pilotName: string, simbriefPilotId: string) {
  const codes = getSimbriefCodes(booking);
  if (!codes.origin || !codes.destination || !codes.aircraft) return null;
  const departure = departureParts(booking.departure);
  const duration = durationParts(booking.duration);
  const virtualService = /^BAV\d+$/i.test(booking.flightNumber);
  const flightNumber = booking.flightNumber.replace(/^(?:BAV|BAW|BA)/i, "");
  return {
    airline: virtualService ? "BAV" : "BAW",
    fltnum: flightNumber,
    callsign: virtualService ? `BAV${flightNumber}` : `BAW${flightNumber}`,
    type: codes.aircraft,
    orig: codes.origin,
    dest: codes.destination,
    deph: departure.hours,
    depm: departure.minutes,
    steh: duration.hours,
    stem: duration.minutes,
    date: simbriefDate(booking.date),
    cpt: pilotName,
    pid: simbriefPilotId,
    planformat: "LIDO",
    units: "KGS",
    navlog: "1",
    maps: "detail",
  };
}

/** Uses SimBrief's documented Dispatch Redirect mechanism; it requires the pilot's own SimBrief login. */
export function buildSimbriefDispatchUrl(booking: PilotBooking, pilotName: string, simbriefPilotId: string) {
  const fields = buildSimbriefDispatchFields(booking, pilotName, simbriefPilotId);
  if (!fields) return null;
  const url = new URL("https://dispatch.simbrief.com/options/custom");
  url.search = new URLSearchParams(fields).toString();
  return url.toString();
}

export type OfficialSimbriefDispatch = {
  action: string;
  expectedOfpId: string;
  fields: Record<string, string>;
};

/** Whether the owner has supplied the private SimBrief VA API key in the host environment. */
export function isSimbriefApiConfigured() {
  return Boolean(process.env.SIMBRIEF_API_KEY?.trim());
}

/**
 * Creates the APIv1 request described in SimBrief's supplied VA integration
 * package. The API key is used only here, on the server, to create the
 * one-time code. It is never returned to the browser.
 */
export function buildOfficialSimbriefDispatch(input: {
  booking: PilotBooking;
  pilotName: string;
  simbriefPilotId: string;
  callbackUrl: string;
}): OfficialSimbriefDispatch | null {
  const apiKey = process.env.SIMBRIEF_API_KEY?.trim();
  if (!apiKey) throw new Error("The SimBrief VA API key has not been configured.");

  const fields = buildSimbriefDispatchFields(input.booking, input.pilotName, input.simbriefPilotId);
  if (!fields) return null;

  const callback = new URL(input.callbackUrl);
  if (callback.protocol !== "https:" && callback.protocol !== "http:") throw new Error("The SimBrief callback URL must use HTTP or HTTPS.");
  // APIv1 signs the callback without its protocol, following SimBrief's
  // reference integration. This keeps the generated code tied to BAV only.
  const outputpage = `${callback.host}${callback.pathname}${callback.search}`;
  const timestamp = String(Math.round(Date.now() / 1000));
  const request = `${fields.orig}${fields.dest}${fields.type}${timestamp}${outputpage}`;
  const apiCode = createHash("md5").update(`${apiKey}${request}`, "utf8").digest("hex");
  const token = createHash("md5").update(`${fields.orig}${fields.dest}${fields.type}`, "utf8").digest("hex").toUpperCase().slice(0, 10);

  return {
    action: SIMBRIEF_WORKER_URL,
    expectedOfpId: `${timestamp}_${token}`,
    fields: { ...fields, apicode: apiCode, outputpage, timestamp },
  };
}

type SimbriefPayload = Record<string, unknown>;

function pick(payload: SimbriefPayload, path: string[]) {
  let value: unknown = payload;
  for (const key of path) {
    if (!value || typeof value !== "object") return null;
    value = (value as Record<string, unknown>)[key];
  }
  const result = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return result || null;
}

function pickFirst(payload: SimbriefPayload, paths: string[][]) {
  for (const path of paths) {
    const value = pick(payload, path);
    if (value) return value;
  }
  return null;
}

function timestampValue(value: string | null) {
  if (!value || !/^\d{9,12}$/.test(value)) return value;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) ? new Date(timestamp * 1000).toISOString() : value;
}

function numberPick(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as SimbriefPayload : null;
}

/** SimBrief returns navlog fixes as either one object or an array, depending on the route. */
function extractRoutePoints(payload: SimbriefPayload): SimbriefRoutePoint[] {
  const navlog = recordValue(payload.navlog);
  const rawFixes = navlog?.fix ?? navlog?.fixes ?? navlog?.waypoint ?? navlog?.waypoints;
  const fixes = Array.isArray(rawFixes) ? rawFixes : rawFixes ? [rawFixes] : [];
  const points = fixes.flatMap((entry) => {
    const record = recordValue(entry);
    if (!record) return [];
    const latitude = numberPick(record.pos_lat ?? record.latitude ?? record.lat);
    const longitude = numberPick(record.pos_long ?? record.longitude ?? record.lon);
    if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
    const name = pickFirst(record, [["ident"], ["name"], ["via"]]) ?? "Route point";
    return [{ name, latitude, longitude }];
  });
  return points.slice(0, 160);
}

export type SimbriefPlanDetails = { ofpId: string | null; ofpUrl: string | null; route: string | null; cruiseAltitude: string | null; alternate: string | null; generatedAt: string | null; origin: string | null; destination: string | null; briefing: SimbriefBriefing };

export function extractSimbriefPlan(payload: SimbriefPayload): SimbriefPlanDetails {
  const generatedAt = timestampValue(pick(payload, ["general", "time_generated"]));
  const route = pick(payload, ["general", "route"]);
  const cruiseAltitude = pick(payload, ["general", "initial_altitude"]);
  const alternate = pick(payload, ["alternate", "icao_code"]) ?? pick(payload, ["alternate", "icao"]);
  return {
    ofpId: pick(payload, ["general", "ofp_id"]),
    ofpUrl: pick(payload, ["files", "pdf", "link"]) ?? pick(payload, ["files", "pdf"]),
    route,
    cruiseAltitude,
    alternate,
    generatedAt,
    origin: pick(payload, ["origin", "icao_code"]) ?? pick(payload, ["origin", "icao"]),
    destination: pick(payload, ["destination", "icao_code"]) ?? pick(payload, ["destination", "icao"]),
    briefing: {
      airline: pick(payload, ["general", "icao_airline"]),
      flightNumber: pick(payload, ["general", "flight_number"]),
      callsign: pick(payload, ["general", "callsign"]),
      aircraft: pickFirst(payload, [["aircraft", "name"], ["aircraft", "type"]]),
      aircraftIcao: pickFirst(payload, [["aircraft", "icaocode"], ["aircraft", "icao_code"], ["general", "icao_aircraft"]]),
      airac: pickFirst(payload, [["general", "airac"], ["params", "airac"]]),
      originName: pick(payload, ["origin", "name"]),
      originLatitude: numberPick((payload.origin as SimbriefPayload | undefined)?.pos_lat ?? (payload.origin as SimbriefPayload | undefined)?.latitude),
      originLongitude: numberPick((payload.origin as SimbriefPayload | undefined)?.pos_long ?? (payload.origin as SimbriefPayload | undefined)?.longitude),
      originRunway: pickFirst(payload, [["origin", "plan_rwy"], ["origin", "runway"]]),
      originMetar: pick(payload, ["origin", "metar"]),
      destinationName: pick(payload, ["destination", "name"]),
      destinationLatitude: numberPick((payload.destination as SimbriefPayload | undefined)?.pos_lat ?? (payload.destination as SimbriefPayload | undefined)?.latitude),
      destinationLongitude: numberPick((payload.destination as SimbriefPayload | undefined)?.pos_long ?? (payload.destination as SimbriefPayload | undefined)?.longitude),
      destinationRunway: pickFirst(payload, [["destination", "plan_rwy"], ["destination", "runway"]]),
      destinationMetar: pick(payload, ["destination", "metar"]),
      alternateName: pick(payload, ["alternate", "name"]),
      alternateMetar: pick(payload, ["alternate", "metar"]),
      scheduledOut: timestampValue(pickFirst(payload, [["times", "sched_out"], ["times", "scheduled_out"]])),
      scheduledIn: timestampValue(pickFirst(payload, [["times", "sched_in"], ["times", "scheduled_in"]])),
      estimatedOut: timestampValue(pickFirst(payload, [["times", "est_out"], ["times", "estimated_out"]])),
      estimatedIn: timestampValue(pickFirst(payload, [["times", "est_in"], ["times", "estimated_in"]])),
      blockTime: pickFirst(payload, [["times", "est_block"], ["times", "block_time"], ["times", "time_block"]]),
      enrouteTime: pickFirst(payload, [["times", "est_time_enroute"], ["times", "time_enroute"], ["times", "enroute_time"]]),
      distanceNm: pickFirst(payload, [["general", "route_distance"], ["general", "route_distance_nm"]]),
      costIndex: pickFirst(payload, [["general", "costindex"], ["general", "cost_index"]]),
      passengerCount: pick(payload, ["weights", "pax_count"]),
      cargoWeight: pickFirst(payload, [["weights", "cargo"], ["weights", "freight"]]),
      taxiFuel: pick(payload, ["fuel", "taxi"]),
      tripFuel: pickFirst(payload, [["fuel", "enroute_burn"], ["fuel", "trip"]]),
      contingencyFuel: pickFirst(payload, [["fuel", "contingency"], ["fuel", "cont"]]),
      alternateFuel: pickFirst(payload, [["fuel", "alternate_burn"], ["fuel", "alternate"]]),
      reserveFuel: pick(payload, ["fuel", "reserve"]),
      extraFuel: pick(payload, ["fuel", "extra"]),
      blockFuel: pickFirst(payload, [["fuel", "plan_ramp"], ["fuel", "ramp"], ["fuel", "block"]]),
      routePoints: extractRoutePoints(payload),
    },
  };
}

/** Retrieves the latest generated OFP published for a pilot's own SimBrief ID. */
export async function fetchLatestSimbriefPlan(simbriefPilotId: string) {
  const pilotId = simbriefPilotId.trim();
  if (!/^\d{1,12}$/.test(pilotId)) throw new Error("A numeric SimBrief Pilot ID is required.");
  const response = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?userid=${encodeURIComponent(pilotId)}&json=1`, { cache: "no-store" });
  if (!response.ok) throw new Error("SimBrief could not find a generated flight plan for this Pilot ID yet.");
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") throw new Error("SimBrief returned an unreadable flight plan.");
  return extractSimbriefPlan(payload as SimbriefPayload);
}
