import { NextResponse } from "next/server";
import { listLiveAcarsSessions } from "@/lib/acars-store";

export const dynamic = "force-dynamic";

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
    lastSnapshot: session.lastSnapshot,
    recentSnapshots: session.recentSnapshots ?? [],
  }));

  return NextResponse.json(
    { flights, refreshedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
