import type { PilotBooking, SimbriefBriefing } from "@/lib/pilot-operations-store";

type Coordinates = { latitude: number; longitude: number };

function validCoordinates(value: Coordinates): value is Coordinates {
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
}

function xplaneIdentifier(value: string, fallback: string) {
  const identifier = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return identifier || fallback;
}

function coordinate(value: number) {
  return value.toFixed(6);
}

function runway(value: string | null) {
  const normalized = value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
  return /^[0-3]\d[CLR]?$/.test(normalized) ? `RW${normalized}` : null;
}

/** Builds the documented X-Plane 11/12 FMS 1100 format from a saved SimBrief briefing. */
export function buildXPlaneFmsPlan(booking: PilotBooking, briefing: SimbriefBriefing, airportCodes: { origin: string | null; destination: string | null }) {
  const origin = { latitude: briefing.originLatitude ?? Number.NaN, longitude: briefing.originLongitude ?? Number.NaN };
  const destination = { latitude: briefing.destinationLatitude ?? Number.NaN, longitude: briefing.destinationLongitude ?? Number.NaN };
  if (!validCoordinates(origin) || !validCoordinates(destination)) {
    throw new Error("SimBrief did not provide usable airport coordinates for this plan yet.");
  }

  if (!airportCodes.origin || !airportCodes.destination) {
    throw new Error("This BAV assignment is missing its X-Plane airport codes.");
  }
  const originIcao = xplaneIdentifier(airportCodes.origin, "ORIGIN");
  const destinationIcao = xplaneIdentifier(airportCodes.destination, "DEST");
  const points = briefing.routePoints.filter((point) => validCoordinates(point));
  const airac = /^\d{4}$/.test(briefing.airac ?? "") ? briefing.airac : "0000";
  const lines = ["I", "1100 Version", `CYCLE ${airac}`, `ADEP ${originIcao}`];
  const departureRunway = runway(briefing.originRunway);
  if (departureRunway) lines.push(`DEPRWY ${departureRunway}`);
  lines.push(`ADES ${destinationIcao}`);
  const destinationRunway = runway(briefing.destinationRunway);
  if (destinationRunway) lines.push(`DESRWY ${destinationRunway}`);
  lines.push(`NUMENR ${points.length + 2}`);
  lines.push(`1 ${originIcao} ADEP 0.000000 ${coordinate(origin.latitude)} ${coordinate(origin.longitude)}`);
  for (const point of points) {
    lines.push(`11 ${xplaneIdentifier(point.name, "FIX")} DRCT 0.000000 ${coordinate(point.latitude)} ${coordinate(point.longitude)}`);
  }
  lines.push(`1 ${destinationIcao} ADES 0.000000 ${coordinate(destination.latitude)} ${coordinate(destination.longitude)}`);
  return `${lines.join("\n")}\n`;
}

export function xplaneFmsFilename(booking: PilotBooking, airportCodes: { origin: string | null; destination: string | null }) {
  const flight = booking.flightNumber.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "BAV";
  const origin = (airportCodes.origin ?? "ORIG").replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "ORIG";
  const destination = (airportCodes.destination ?? "DEST").replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "DEST";
  return `${flight}_${origin}_${destination}.fms`;
}
