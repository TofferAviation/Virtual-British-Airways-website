import { NextResponse } from "next/server";
import { getActiveAcarsSessionForPilot } from "@/lib/acars-store";
import { requirePilotSession } from "@/lib/pilot-auth";

export const dynamic = "force-dynamic";

/**
 * Private companion to the public BA-Radar feed. This deliberately exposes
 * only the signed-in pilot's active Ember session and excludes coordinates,
 * booking references, passenger identities, transcripts and credentials.
 */
export async function GET() {
  try {
    const pilot = await requirePilotSession();
    const flight = await getActiveAcarsSessionForPilot(pilot.pilotId);
    if (!flight) return NextResponse.json({ operation: null }, { headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({
      operation: {
        id: flight.id,
        flightNumber: flight.flightNumber,
        from: flight.from,
        to: flight.to,
        aircraft: flight.aircraft,
        updatedAt: flight.updatedAt,
        cabin: flight.lastSnapshot?.cabin ?? null,
        connectivity: flight.lastSnapshot?.connectivity ?? null,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ operation: null }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
