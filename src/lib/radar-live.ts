import { listLiveAcarsSessionTrackSnapshots, listLiveAcarsSessions } from "@/lib/acars-store";
import type { SupportedSimulator } from "@/lib/acars-contract";
import { resolveBritishAirwaysCallsign, toBritishAirwaysFlightNumber } from "@/lib/ba-flight-identifiers";
import { BAV_NETWORK_ICAO_BY_IATA } from "@/data/bav-network-2026";
import { listFleetAircraft, type FleetAircraftImage } from "@/lib/fleet-service";
import { getPilotBooking, getPilotFlightPlan, type SimbriefBriefing } from "@/lib/pilot-operations-store";

export type PublicRadarSnapshot = {
  timestamp: string;
  latitude: number;
  longitude: number;
  altitudeFt: number;
  groundSpeedKt: number;
  headingDeg: number;
  indicatedAirspeedKt: number | null;
  trueAirspeedKt: number | null;
  squawk: string | null;
  beaconOn: boolean;
  enginesRunning: boolean;
  onGround: boolean;
  verticalSpeedFpm: number | null;
  detectedAirport: string | null;
  diversionAirport: string | null;
};

export type PublicRadarRoutePoint = {
  latitude: number;
  longitude: number;
};

export type PublicRadarTrackPoint = PublicRadarRoutePoint & {
  timestamp: string;
  onGround: boolean;
};

export type PublicRadarPlannedRoute = {
  source: "simbrief" | "direct";
  points: PublicRadarRoutePoint[];
};

export type PublicRadarJourneyProgress = {
  /** Total planned route distance, calculated from the active SimBrief route. */
  plannedDistanceNm: number;
  /** Distance still left along the planned route, not the straight-line distance. */
  remainingDistanceNm: number;
  /** Progress projected onto the planned route. */
  progressPercent: number;
  /** Current groundspeed estimate. Null when the aircraft is stationary or data is not usable. */
  estimatedRemainingMinutes: number | null;
};

export type PublicRadarWeatherStation = {
  role: "Departure" | "Arrival" | "Alternate";
  icao: string;
};

export type PublicRadarFlight = {
  id: string;
  /** BA IATA flight number, for example BA1076. */
  flightNumber: string;
  /** BA ICAO callsign, for example BAW1076. */
  callsign: string;
  from: string;
  to: string;
  aircraft: string;
  registration: string | null;
  aircraftImage: FleetAircraftImage | null;
  simulator: SupportedSimulator;
  updatedAt: string;
  distanceNm: number;
  connectionHealthy: boolean;
  /** The pilot-declared live diversion destination, if Ember has one. */
  diversionAirport: string | null;
  lastSnapshot: PublicRadarSnapshot | null;
  recentSnapshots: PublicRadarSnapshot[];
  /** The pilot's saved SimBrief routing, shown only while the flight is live. */
  plannedRoute: PublicRadarPlannedRoute | null;
  /** Progress derived from the live aircraft position and its plotted route. */
  journeyProgress: PublicRadarJourneyProgress | null;
  /** ICAO stations whose live METAR/TAF can be read for this flight. */
  weatherStations: PublicRadarWeatherStation[];
  /** A reduced, durable history for the map path (separate from chart history). */
  trackSnapshots: PublicRadarTrackPoint[];
};

function publicSnapshot(snapshot: Awaited<ReturnType<typeof listLiveAcarsSessions>>[number]["lastSnapshot"]): PublicRadarSnapshot | null {
  if (!snapshot) return null;
  const { timestamp, latitude, longitude, altitudeFt, groundSpeedKt, headingDeg, indicatedAirspeedKt, trueAirspeedKt, squawk, beaconOn, enginesRunning, onGround, verticalSpeedFpm, detectedAirport, diversionAirport } = snapshot;
  return { timestamp, latitude, longitude, altitudeFt, groundSpeedKt, headingDeg, indicatedAirspeedKt, trueAirspeedKt, squawk, beaconOn, enginesRunning, onGround, verticalSpeedFpm, detectedAirport, diversionAirport };
}

function publicTrackPoint(snapshot: Awaited<ReturnType<typeof listLiveAcarsSessions>>[number]["lastSnapshot"]): PublicRadarTrackPoint | null {
  if (!snapshot || !Number.isFinite(snapshot.latitude) || !Number.isFinite(snapshot.longitude)) return null;
  return { timestamp: snapshot.timestamp, latitude: snapshot.latitude, longitude: snapshot.longitude, onGround: snapshot.onGround };
}

function validRoutePoint(point: { latitude: number | null | undefined; longitude: number | null | undefined }): point is PublicRadarRoutePoint {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude as number) <= 90 && Math.abs(point.longitude as number) <= 180;
}

function routeDistanceSquared(left: PublicRadarRoutePoint, right: PublicRadarRoutePoint) {
  return (left.latitude - right.latitude) ** 2 + (left.longitude - right.longitude) ** 2;
}

function greatCirclePoint(origin: PublicRadarRoutePoint, destination: PublicRadarRoutePoint, fraction: number): PublicRadarRoutePoint {
  const radians = (value: number) => value * Math.PI / 180;
  const degrees = (value: number) => value * 180 / Math.PI;
  const originLatitude = radians(origin.latitude);
  const originLongitude = radians(origin.longitude);
  const destinationLatitude = radians(destination.latitude);
  const destinationLongitude = radians(destination.longitude);
  const distance = 2 * Math.asin(Math.sqrt(Math.sin((destinationLatitude - originLatitude) / 2) ** 2 + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin((destinationLongitude - originLongitude) / 2) ** 2));
  if (distance < 0.000001) return origin;
  const first = Math.sin((1 - fraction) * distance) / Math.sin(distance);
  const second = Math.sin(fraction * distance) / Math.sin(distance);
  const x = first * Math.cos(originLatitude) * Math.cos(originLongitude) + second * Math.cos(destinationLatitude) * Math.cos(destinationLongitude);
  const y = first * Math.cos(originLatitude) * Math.sin(originLongitude) + second * Math.cos(destinationLatitude) * Math.sin(destinationLongitude);
  const z = first * Math.sin(originLatitude) + second * Math.sin(destinationLatitude);
  return { latitude: degrees(Math.atan2(z, Math.sqrt(x * x + y * y))), longitude: degrees(Math.atan2(y, x)) };
}

function reduceRoutePoints(points: PublicRadarRoutePoint[], limit = 240) {
  if (points.length <= limit) return points;
  const lastIndex = points.length - 1;
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * lastIndex / (limit - 1))]);
}

const EARTH_RADIUS_NM = 3_440.065;

function radians(value: number) {
  return value * Math.PI / 180;
}

function longitudeDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

function distanceNm(from: PublicRadarRoutePoint, to: PublicRadarRoutePoint) {
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDeltaRadians = radians(longitudeDelta(from.longitude, to.longitude));
  const latitudeOne = radians(from.latitude);
  const latitudeTwo = radians(to.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(longitudeDeltaRadians / 2) ** 2;
  return EARTH_RADIUS_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Return the nearest point along a plotted route. This intentionally uses a
 * local projection per segment: it is stable across the dateline while the
 * route's leg distances are still calculated as great-circle distances.
 */
function routeProgressAtPosition(points: PublicRadarRoutePoint[], position: PublicRadarRoutePoint, groundSpeedKt: number): PublicRadarJourneyProgress | null {
  if (points.length < 2) return null;
  let plannedDistanceNm = 0;
  let closestDistanceSquared = Number.POSITIVE_INFINITY;
  let closestAlongNm = 0;
  let distanceBeforeLegNm = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const legDistanceNm = distanceNm(from, to);
    if (!Number.isFinite(legDistanceNm) || legDistanceNm <= 0.0001) continue;

    const latitudeScale = Math.cos(radians((from.latitude + to.latitude + position.latitude) / 3));
    const segmentX = longitudeDelta(from.longitude, to.longitude) * latitudeScale;
    const segmentY = to.latitude - from.latitude;
    const positionX = longitudeDelta(from.longitude, position.longitude) * latitudeScale;
    const positionY = position.latitude - from.latitude;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    const fraction = segmentLengthSquared <= 0 ? 0 : Math.max(0, Math.min(1, (positionX * segmentX + positionY * segmentY) / segmentLengthSquared));
    const deltaX = positionX - segmentX * fraction;
    const deltaY = positionY - segmentY * fraction;
    const candidateDistanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (candidateDistanceSquared < closestDistanceSquared) {
      closestDistanceSquared = candidateDistanceSquared;
      closestAlongNm = distanceBeforeLegNm + legDistanceNm * fraction;
    }

    distanceBeforeLegNm += legDistanceNm;
    plannedDistanceNm += legDistanceNm;
  }

  if (!Number.isFinite(plannedDistanceNm) || plannedDistanceNm < 1) return null;
  const remainingDistanceNm = Math.max(0, plannedDistanceNm - closestAlongNm);
  const progressPercent = Math.max(0, Math.min(100, closestAlongNm / plannedDistanceNm * 100));
  const estimatedRemainingMinutes = groundSpeedKt >= 70 && remainingDistanceNm >= 1
    ? Math.max(1, Math.round(remainingDistanceNm / groundSpeedKt * 60))
    : null;
  return { plannedDistanceNm, remainingDistanceNm, progressPercent, estimatedRemainingMinutes };
}

function plannedRouteFromBriefing(briefing: SimbriefBriefing | null): PublicRadarPlannedRoute | null {
  if (!briefing) return null;
  const origin = { latitude: briefing.originLatitude, longitude: briefing.originLongitude };
  const destination = { latitude: briefing.destinationLatitude, longitude: briefing.destinationLongitude };
  if (!validRoutePoint(origin) || !validRoutePoint(destination)) return null;

  const simbriefPoints = briefing.routePoints.filter(validRoutePoint).map((point) => ({ latitude: point.latitude, longitude: point.longitude }));
  const points = [origin, ...simbriefPoints, destination]
    .filter((point, index, all) => index === 0 || routeDistanceSquared(point, all[index - 1]) > 0.00000001);
  if (points.length > 2) return { source: "simbrief", points: reduceRoutePoints(points) };
  return { source: "direct", points: Array.from({ length: 49 }, (_, index) => greatCirclePoint(origin, destination, index / 48)) };
}

function toIcao(station: string | null | undefined) {
  const normalised = station?.trim().toUpperCase() ?? "";
  if (/^[A-Z]{4}$/.test(normalised)) return normalised;
  return BAV_NETWORK_ICAO_BY_IATA[normalised] ?? null;
}

function weatherStationsForFlight(from: string, to: string, alternate: string | null | undefined) {
  const candidates: Array<[PublicRadarWeatherStation["role"], string | null]> = [
    ["Departure", toIcao(from)],
    ["Arrival", toIcao(to)],
    ["Alternate", toIcao(alternate)],
  ];
  const seen = new Set<string>();
  return candidates.flatMap(([role, icao]) => {
    if (!icao || seen.has(icao)) return [];
    seen.add(icao);
    return [{ role, icao }];
  });
}

/**
 * Public, read-only aircraft tracker data. Identity and booking data remain
 * within authenticated account tools; a live tail and its approved fleet
 * photo are exposed only for the aircraft actively transmitting a position.
 */
export async function listPublicRadarFlights(): Promise<PublicRadarFlight[]> {
  const sessions = await listLiveAcarsSessions();
  const fleetByRegistration = new Map<string, FleetAircraftImage | null>();
  const [tracksBySession, plans] = await Promise.all([
    listLiveAcarsSessionTrackSnapshots(sessions),
    Promise.all(sessions.map(async (session) => {
      try {
        const plan = await getPilotFlightPlan(session.bookingId, session.pilotId);
        const booking = await getPilotBooking(session.bookingId, session.pilotId);
        return [session.id, {
          plannedRoute: plannedRouteFromBriefing(plan?.simbriefBriefing ?? null),
          alternate: plan?.alternate ?? null,
          callsign: booking?.callsign ?? null,
        }] as const;
      } catch (error) {
        console.error(`[radar] Could not load the planned route for ${session.id}.`, error);
        return [session.id, { plannedRoute: null, alternate: null, callsign: null }] as const;
      }
    })),
  ]);
  const flightPlansBySession = new Map(plans);
  try {
    for (const aircraft of await listFleetAircraft()) {
      fleetByRegistration.set(aircraft.registration.toUpperCase(), aircraft.image);
    }
  } catch (error) {
    // Tracking must stay available when the optional public photo catalogue
    // has a transient problem. A registration still appears when Ember sends it.
    console.error("[radar] Could not load Fleet aircraft images.", error);
  }

  return sessions.map((session) => {
    const registration = session.lastSnapshot?.registration ?? null;
    return {
      id: session.id,
      flightNumber: toBritishAirwaysFlightNumber(session.flightNumber),
      callsign: resolveBritishAirwaysCallsign(session.flightNumber, flightPlansBySession.get(session.id)?.callsign),
      from: session.from,
      to: session.to,
      aircraft: session.aircraft,
      registration,
      aircraftImage: registration ? fleetByRegistration.get(registration.toUpperCase()) ?? null : null,
      simulator: session.simulator,
      updatedAt: session.updatedAt,
      distanceNm: session.distanceNm,
      connectionHealthy: session.connectionHealthy,
      diversionAirport: session.lastSnapshot?.diversionAirport ?? null,
      lastSnapshot: publicSnapshot(session.lastSnapshot),
      recentSnapshots: (session.recentSnapshots ?? []).map(publicSnapshot).filter((snapshot): snapshot is PublicRadarSnapshot => snapshot != null),
      plannedRoute: flightPlansBySession.get(session.id)?.plannedRoute ?? null,
      journeyProgress: session.lastSnapshot && flightPlansBySession.get(session.id)?.plannedRoute
        ? routeProgressAtPosition(
          flightPlansBySession.get(session.id)!.plannedRoute!.points,
          { latitude: session.lastSnapshot.latitude, longitude: session.lastSnapshot.longitude },
          session.lastSnapshot.groundSpeedKt)
        : null,
      weatherStations: weatherStationsForFlight(session.from, session.to, flightPlansBySession.get(session.id)?.alternate),
      trackSnapshots: (tracksBySession.get(session.id) ?? []).map(publicTrackPoint).filter((snapshot): snapshot is PublicRadarTrackPoint => snapshot != null),
    };
  });
}
