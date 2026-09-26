import { listLiveAcarsSessionTrackSnapshots, listLiveAcarsSessions } from "@/lib/acars-store";
import type { SupportedSimulator } from "@/lib/acars-contract";
import { toBritishAirwaysCallsign, toBritishAirwaysFlightNumber } from "@/lib/ba-flight-identifiers";
import { listFleetAircraft, type FleetAircraftImage } from "@/lib/fleet-service";
import { getPilotFlightPlan, type SimbriefBriefing } from "@/lib/pilot-operations-store";

export type PublicRadarSnapshot = {
  timestamp: string;
  latitude: number;
  longitude: number;
  altitudeFt: number;
  groundSpeedKt: number;
  headingDeg: number;
  indicatedAirspeedKt: number | null;
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
};

export type PublicRadarPlannedRoute = {
  source: "simbrief" | "direct";
  points: PublicRadarRoutePoint[];
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
  /** A reduced, durable history for the map path (separate from chart history). */
  trackSnapshots: PublicRadarTrackPoint[];
};

function publicSnapshot(snapshot: Awaited<ReturnType<typeof listLiveAcarsSessions>>[number]["lastSnapshot"]): PublicRadarSnapshot | null {
  if (!snapshot) return null;
  const { timestamp, latitude, longitude, altitudeFt, groundSpeedKt, headingDeg, indicatedAirspeedKt, squawk, beaconOn, enginesRunning, onGround, verticalSpeedFpm, detectedAirport, diversionAirport } = snapshot;
  return { timestamp, latitude, longitude, altitudeFt, groundSpeedKt, headingDeg, indicatedAirspeedKt, squawk, beaconOn, enginesRunning, onGround, verticalSpeedFpm, detectedAirport, diversionAirport };
}

function publicTrackPoint(snapshot: Awaited<ReturnType<typeof listLiveAcarsSessions>>[number]["lastSnapshot"]): PublicRadarTrackPoint | null {
  if (!snapshot || !Number.isFinite(snapshot.latitude) || !Number.isFinite(snapshot.longitude)) return null;
  return { timestamp: snapshot.timestamp, latitude: snapshot.latitude, longitude: snapshot.longitude };
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
        return [session.id, plannedRouteFromBriefing(plan?.simbriefBriefing ?? null)] as const;
      } catch (error) {
        console.error(`[radar] Could not load the planned route for ${session.id}.`, error);
        return [session.id, null] as const;
      }
    })),
  ]);
  const plannedRoutesBySession = new Map(plans);
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
      callsign: toBritishAirwaysCallsign(session.flightNumber),
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
      plannedRoute: plannedRoutesBySession.get(session.id) ?? null,
      trackSnapshots: (tracksBySession.get(session.id) ?? []).map(publicTrackPoint).filter((snapshot): snapshot is PublicRadarTrackPoint => snapshot != null),
    };
  });
}
