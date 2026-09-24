export type SupportedSimulator = "xplane12" | "msfs2020" | "msfs2024";

export const supportedSimulatorLabels: Record<SupportedSimulator, string> = {
  xplane12: "X-Plane 12",
  msfs2020: "Microsoft Flight Simulator 2020",
  msfs2024: "Microsoft Flight Simulator 2024",
};

export type AcarsFlightSnapshot = {
  simulator: SupportedSimulator;
  sessionId: string;
  pilotId: string;
  bookingId: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  altitudeFt: number;
  groundSpeedKt: number;
  headingDeg: number;
  indicatedAirspeedKt: number | null;
  squawk: string | null;
  beaconOn: boolean;
  fuelKg: number | null;
  enginesRunning: boolean;
  parkingBrakeSet: boolean;
  onGround: boolean;
  verticalSpeedFpm: number | null;
  // Beacon can arm a session before departure. This durable marker prevents
  // a parked aircraft from being logged as a completed PIREP.
  flightStarted: boolean;
  registration: string | null;
  /** Airport reported by a native simulator adapter when the aircraft is on the ground. */
  detectedAirport: string | null;
  /** Diversion airport declared by the pilot in Ember while the flight remains live. */
  diversionAirport: string | null;
};

export type AcarsCompletedFlight = {
  simulator: SupportedSimulator;
  sessionId: string;
  pilotId: string;
  bookingId: string;
  startedAt: string;
  completedAt: string;
  blockMinutes: number;
  distanceNm: number;
  landingFpm: number | null;
  fuelUsedKg: number | null;
};

export const ACARS_PROTOCOL_VERSION = 1;
