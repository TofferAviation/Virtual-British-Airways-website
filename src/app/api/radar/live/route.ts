import { NextResponse } from "next/server";
import { listLiveAcarsSessions } from "@/lib/acars-store";
import type { AcarsFlightSnapshot } from "@/lib/acars-contract";

export const dynamic = "force-dynamic";

function publicSnapshot(snapshot: AcarsFlightSnapshot | null) {
  if (!snapshot) return null;
  const { timestamp, latitude, longitude, altitudeFt, groundSpeedKt, headingDeg, onGround, verticalSpeedFpm } = snapshot;
  return { timestamp, latitude, longitude, altitudeFt, groundSpeedKt, headingDeg, onGround, verticalSpeedFpm };
}

// This is deliberately a public, read-only view. Pilot identity and booking
// details remain available only to authenticated pilots and staff tools.
export async function GET() {
  const sessions = await listLiveAcarsSessions();
  const flights = sessions.map((session) => ({
    id: session.id,
    flightNumber: session.flightNumber,
    from: session.from,
    to: session.to,
    aircraft: session.aircraft,
    simulator: session.simulator,
    updatedAt: session.updatedAt,
    distanceNm: session.distanceNm,
    connectionHealthy: session.connectionHealthy,
    lastSnapshot: publicSnapshot(session.lastSnapshot),
    recentSnapshots: (session.recentSnapshots ?? []).map(publicSnapshot).filter((snapshot) => snapshot != null),
  }));

  return NextResponse.json(
    { flights, refreshedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
