import { listLiveAcarsSessions } from "@/lib/acars-store";
import type { SupportedSimulator } from "@/lib/acars-contract";
import { toBritishAirwaysCallsign, toBritishAirwaysFlightNumber } from "@/lib/ba-flight-identifiers";
import { listFleetAircraft, type FleetAircraftImage } from "@/lib/fleet-service";

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
};

function publicSnapshot(snapshot: Awaited<ReturnType<typeof listLiveAcarsSessions>>[number]["lastSnapshot"]): PublicRadarSnapshot | null {
  if (!snapshot) return null;
  const { timestamp, latitude, longitude, altitudeFt, groundSpeedKt, headingDeg, indicatedAirspeedKt, squawk, beaconOn, enginesRunning, onGround, verticalSpeedFpm, detectedAirport, diversionAirport } = snapshot;
  return { timestamp, latitude, longitude, altitudeFt, groundSpeedKt, headingDeg, indicatedAirspeedKt, squawk, beaconOn, enginesRunning, onGround, verticalSpeedFpm, detectedAirport, diversionAirport };
}

/**
 * Public, read-only aircraft tracker data. Identity and booking data remain
 * within authenticated account tools; a live tail and its approved fleet
 * photo are exposed only for the aircraft actively transmitting a position.
 */
export async function listPublicRadarFlights(): Promise<PublicRadarFlight[]> {
  const sessions = await listLiveAcarsSessions();
  const fleetByRegistration = new Map<string, FleetAircraftImage | null>();
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
    };
  });
}
