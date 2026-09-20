import { NextResponse } from "next/server";
import type { AcarsFlightSnapshot } from "@/lib/acars-contract";
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
    squawk: optionalSquawk(body.squawk),
    beaconOn: Boolean(body.beaconOn),
    fuelKg: optionalFinite(body.fuelKg, 0, 1_000_000),
    enginesRunning: Boolean(body.enginesRunning),
    parkingBrakeSet: Boolean(body.parkingBrakeSet),
    onGround: Boolean(body.onGround),
    verticalSpeedFpm: optionalFinite(body.verticalSpeedFpm, -20_000, 20_000),
    flightStarted: Boolean(body.flightStarted),
    registration: optionalRegistration(body.registration),
  };
  const session = await appendAcarsSnapshot(id, auth.account.id, snapshot);
  if (!session) return NextResponse.json({ error: "Session is no longer active." }, { status: 409 });
  return NextResponse.json({ ok: true, updatedAt: session.updatedAt, distanceNm: Math.round(session.distanceNm * 10) / 10 });
}
