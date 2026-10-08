export type SupportedSimulator = "xplane12" | "msfs2020" | "msfs2024";

/**
 * A compact, private-only cabin state supplied by Ember.  It intentionally
 * excludes passenger identities, cabin transcripts and any account material.
 */
export type AcarsCabinStatus = {
  flightPhase: string;
  seatbeltSignOn: boolean;
  boardedPassengerCount: number;
  serviceState: "preparing" | "boarding" | "ground_operations" | "in_service" | "arrival_preparation";
  technicalEventState: "disabled" | "monitoring" | "event_filed" | "held" | "unavailable";
};

/**
 * Ember's cabin-demand model, not direct Starlink, satellite or passenger
 * device telemetry. The `isModelled` flag must remain visible to consumers.
 */
export type AcarsConnectivityStatus = {
  provider: string;
  enabled: boolean;
  onlinePassengerCount: number;
  connectedDeviceCount: number;
  downlinkMbps: number;
  uplinkMbps: number;
  latencyMs: number;
  linkQualityPercent: number;
  isModelled: boolean;
};

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
  /** True airspeed when the connected simulator exposes it. */
  trueAirspeedKt: number | null;
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
  /** Private Ember cabin state, never returned by the public live Radar endpoint. */
  cabin: AcarsCabinStatus | null;
  /** Private Ember cabin-connectivity model, never returned by public Radar. */
  connectivity: AcarsConnectivityStatus | null;
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
