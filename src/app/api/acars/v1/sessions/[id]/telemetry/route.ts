import { NextResponse } from "next/server";
import type { AcarsFlightSnapshot } from "@/lib/acars-contract";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { appendAcarsSnapshot, getAcarsSession } from "@/lib/acars-store";

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
    fuelKg: typeof body.fuelKg === "number" ? body.fuelKg : null,
    enginesRunning: Boolean(body.enginesRunning),
    parkingBrakeSet: Boolean(body.parkingBrakeSet),
    onGround: Boolean(body.onGround),
    verticalSpeedFpm: typeof body.verticalSpeedFpm === "number" ? body.verticalSpeedFpm : null,
  };
  const session = await appendAcarsSnapshot(id, auth.account.id, snapshot);
  if (!session) return NextResponse.json({ error: "Session is no longer active." }, { status: 409 });
  return NextResponse.json({ ok: true, updatedAt: session.updatedAt, distanceNm: Math.round(session.distanceNm * 10) / 10 });
}
