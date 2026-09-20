import { listLiveAcarsSessions } from "@/lib/acars-store";
import type { SupportedSimulator } from "@/lib/acars-contract";
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
};

export type PublicRadarFlight = {
  id: string;
  flightNumber: string;
  from: string;
  to: string;
  aircraft: string;
  registration: string | null;
  aircraftImage: FleetAircraftImage | null;
  simulator: SupportedSimulator;
  updatedAt: string;
  distanceNm: number;
  connectionHealthy: boolean;
  lastSnapshot: PublicRadarSnapshot | null;
  recentSnapshots: PublicRadarSnapshot[];
};

function publicSnapshot(snapshot: Awaited<ReturnType<typeof listLiveAcarsSessions>>[number]["lastSnapshot"]): PublicRadarSnapshot | null {
  if (!snapshot) return null;
  const { timestamp, latitude, longitude, altitudeFt, groundSpeedKt, headingDeg, indicatedAirspeedKt, squawk, beaconOn, enginesRunning, onGround, verticalSpeedFpm } = snapshot;
  return { timestamp, latitude, longitude, altitudeFt, groundSpeedKt, headingDeg, indicatedAirspeedKt, squawk, beaconOn, enginesRunning, onGround, verticalSpeedFpm };
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
      flightNumber: session.flightNumber,
      from: session.from,
      to: session.to,
      aircraft: session.aircraft,
      registration,
      aircraftImage: registration ? fleetByRegistration.get(registration.toUpperCase()) ?? null : null,
      simulator: session.simulator,
      updatedAt: session.updatedAt,
      distanceNm: session.distanceNm,
      connectionHealthy: session.connectionHealthy,
      lastSnapshot: publicSnapshot(session.lastSnapshot),
      recentSnapshots: (session.recentSnapshots ?? []).map(publicSnapshot).filter((snapshot): snapshot is PublicRadarSnapshot => snapshot != null),
    };
  });
}
