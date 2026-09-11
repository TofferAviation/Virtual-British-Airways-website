import type { PilotBooking } from "@/lib/pilot-operations-store";

const airportIcao: Record<string, string> = {
  LHR: "EGLL", LGW: "EGKK", LCY: "EGLC", OSL: "ENGM", JFK: "KJFK", LAX: "KLAX", PDX: "KPDX", DXB: "OMDB", SIN: "WSSS", HND: "RJTT", CPT: "FACT", SYD: "YSSY", SFO: "KSFO", SEA: "KSEA", IAH: "KIAH", JNB: "FAOR",
};

const aircraftIcao: Record<string, string> = {
  "Airbus A320": "A320",
  "Airbus A320neo": "A20N",
  "Airbus A350-1000": "A35K",
  "Boeing 777-200ER": "B772",
  "Boeing 777-300ER": "B77W",
};

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

/** Uses SimBrief's documented Dispatch Redirect mechanism; it requires the pilot's own SimBrief login. */
export function buildSimbriefDispatchUrl(booking: PilotBooking, pilotName: string, simbriefPilotId: string) {
  const codes = getSimbriefCodes(booking);
  if (!codes.origin || !codes.destination || !codes.aircraft) return null;
  const departure = departureParts(booking.departure);
  const duration = durationParts(booking.duration);
  const flightNumber = booking.flightNumber.replace(/^BA/i, "");
  const url = new URL("https://dispatch.simbrief.com/options/custom");
  url.search = new URLSearchParams({
    airline: "BAW",
    fltnum: flightNumber,
    callsign: `BAW${flightNumber}`,
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
  }).toString();
  return url.toString();
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

export type SimbriefPlanDetails = { ofpId: string | null; ofpUrl: string | null; route: string | null; cruiseAltitude: string | null; alternate: string | null; generatedAt: string | null; origin: string | null; destination: string | null };

export function extractSimbriefPlan(payload: SimbriefPayload): SimbriefPlanDetails {
  return {
    ofpId: pick(payload, ["general", "ofp_id"]),
    ofpUrl: pick(payload, ["files", "pdf", "link"]) ?? pick(payload, ["files", "pdf"]),
    route: pick(payload, ["general", "route"]),
    cruiseAltitude: pick(payload, ["general", "initial_altitude"]),
    alternate: pick(payload, ["alternate", "icao_code"]) ?? pick(payload, ["alternate", "icao"]),
    generatedAt: pick(payload, ["general", "time_generated"]),
    origin: pick(payload, ["origin", "icao_code"]) ?? pick(payload, ["origin", "icao"]),
    destination: pick(payload, ["destination", "icao_code"]) ?? pick(payload, ["destination", "icao"]),
  };
}
