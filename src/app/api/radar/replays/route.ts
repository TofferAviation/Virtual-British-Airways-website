import { NextResponse } from "next/server";
import { listCompletedAcarsSessionsForPilot } from "@/lib/acars-store";
import { requirePilotSession } from "@/lib/pilot-auth";

export const dynamic = "force-dynamic";

/** The replay library is deliberately private: it exposes only the signed-in pilot's flights. */
export async function GET() {
  try {
    const session = await requirePilotSession();
    const flights = await listCompletedAcarsSessionsForPilot(session.pilotId);
    return NextResponse.json({
      replays: flights.map((flight) => ({
        id: flight.id,
        flightNumber: flight.flightNumber,
        from: flight.from,
        to: flight.to,
        aircraft: flight.aircraft,
        completedAt: flight.completedAt,
        distanceNm: Math.round(flight.distanceNm),
        landingFpm: flight.landingFpm,
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    // BA-Radar stays public; an unauthenticated visitor simply has no private library.
    return NextResponse.json({ replays: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
