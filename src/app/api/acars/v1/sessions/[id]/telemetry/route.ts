import { NextResponse } from "next/server";
import type { AcarsCabinStatus, AcarsConnectivityStatus, AcarsFlightSnapshot } from "@/lib/acars-contract";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { appendAcarsSnapshot, getAcarsSession } from "@/lib/acars-store";

function optionalFinite(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

function optionalSquawk(value: unknown) {
  return typeof value === "string" && /^[0-7]{4}$/.test(value) ? value : null;
}

function optionalRegistration(value: unknown) {
  const registration = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9-]{2,16}$/.test(registration) ? registration : null;
}

function optionalAirport(value: unknown) {
  const airport = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9]{3,4}$/.test(airport) ? airport : null;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function optionalShortLabel(value: unknown, maximum = 48) {
  const label = typeof value === "string" ? value.trim() : "";
  return label && label.length <= maximum ? label : null;
}

function optionalWhole(value: unknown, maximum: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum ? value : null;
}

function optionalCabinStatus(value: unknown): AcarsCabinStatus | null {
  const cabin = record(value);
  if (!cabin) return null;
  const flightPhase = optionalShortLabel(cabin.flightPhase, 32);
  const boardedPassengerCount = optionalWhole(cabin.boardedPassengerCount, 900);
  const serviceState = cabin.serviceState;
  const technicalEventState = cabin.technicalEventState;
  if (!flightPhase || boardedPassengerCount == null || typeof cabin.seatbeltSignOn !== "boolean" ||
      serviceState !== "preparing" && serviceState !== "boarding" && serviceState !== "ground_operations" && serviceState !== "in_service" && serviceState !== "arrival_preparation" ||
      technicalEventState !== "disabled" && technicalEventState !== "monitoring" && technicalEventState !== "event_filed" && technicalEventState !== "held" && technicalEventState !== "unavailable") return null;
  return { flightPhase, seatbeltSignOn: cabin.seatbeltSignOn, boardedPassengerCount, serviceState, technicalEventState };
}

function optionalConnectivityStatus(value: unknown): AcarsConnectivityStatus | null {
  const connectivity = record(value);
  if (!connectivity) return null;
  const provider = optionalShortLabel(connectivity.provider, 48);
  const onlinePassengerCount = optionalWhole(connectivity.onlinePassengerCount, 900);
  const connectedDeviceCount = optionalWhole(connectivity.connectedDeviceCount, 1_800);
  const downlinkMbps = optionalFinite(connectivity.downlinkMbps, 0, 10_000);
  const uplinkMbps = optionalFinite(connectivity.uplinkMbps, 0, 10_000);
  const latencyMs = optionalWhole(connectivity.latencyMs, 5_000);
  const linkQualityPercent = optionalFinite(connectivity.linkQualityPercent, 0, 100);
  if (!provider || onlinePassengerCount == null || connectedDeviceCount == null || downlinkMbps == null || uplinkMbps == null || latencyMs == null || linkQualityPercent == null ||
      typeof connectivity.enabled !== "boolean" || typeof connectivity.isModelled !== "boolean") return null;
  return { provider, enabled: connectivity.enabled, onlinePassengerCount, connectedDeviceCount, downlinkMbps, uplinkMbps, latencyMs, linkQualityPercent, isModelled: connectivity.isModelled };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const current = await getAcarsSession(id);
  if (!current || current.pilotId !== auth.account.id) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  const body = await request.json().catch(() => null) as Partial<AcarsFlightSnapshot> | null;
  if (!body || typeof body.latitude !== "number" || typeof body.longitude !== "number" || typeof body.altitudeFt !== "number" || typeof body.groundSpeedKt !== "number" || typeof body.headingDeg !== "number") {
    return NextResponse.json({ error: "Invalid telemetry payload." }, { status: 400 });
  }
  const snapshot: AcarsFlightSnapshot = {
    simulator: current.simulator,
    sessionId: current.id,
    pilotId: auth.account.id,
    bookingId: current.bookingId,
    timestamp: new Date().toISOString(),
    latitude: body.latitude,
    longitude: body.longitude,
    altitudeFt: body.altitudeFt,
    groundSpeedKt: body.groundSpeedKt,
    headingDeg: body.headingDeg,
    indicatedAirspeedKt: optionalFinite(body.indicatedAirspeedKt, 0, 1_000),
    trueAirspeedKt: optionalFinite(body.trueAirspeedKt, 0, 1_000),
    squawk: optionalSquawk(body.squawk),
    beaconOn: Boolean(body.beaconOn),
    fuelKg: optionalFinite(body.fuelKg, 0, 1_000_000),
    enginesRunning: Boolean(body.enginesRunning),
    parkingBrakeSet: Boolean(body.parkingBrakeSet),
    onGround: Boolean(body.onGround),
    verticalSpeedFpm: optionalFinite(body.verticalSpeedFpm, -20_000, 20_000),
    flightStarted: Boolean(body.flightStarted),
    registration: optionalRegistration(body.registration),
    detectedAirport: optionalAirport(body.detectedAirport),
    diversionAirport: optionalAirport(body.diversionAirport),
    cabin: optionalCabinStatus(body.cabin),
    connectivity: optionalConnectivityStatus(body.connectivity),
  };
  const session = await appendAcarsSnapshot(id, auth.account.id, snapshot);
  if (!session) return NextResponse.json({ error: "Session is no longer active." }, { status: 409 });
  return NextResponse.json({ ok: true, updatedAt: session.updatedAt, distanceNm: Math.round(session.distanceNm * 10) / 10 });
}
