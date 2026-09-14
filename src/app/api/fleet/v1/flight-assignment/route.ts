import { NextRequest, NextResponse } from "next/server";
import { requireFleetPilot } from "@/lib/fleet-pilot-auth";
import { FleetServiceError, getActiveFleetFlightAssignmentForPilot } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";

/**
 * The authoritative recovery endpoint for Cabin Control. A pilot can close or
 * update the desktop app without losing a legitimate active registration.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireFleetPilot(request);
    const assignment = await getActiveFleetFlightAssignmentForPilot(actor);
    return NextResponse.json({ assignment });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json(
      { error: known ? error.message : "Could not load the active aircraft assignment." },
      { status: known ? error.status : 500 },
    );
  }
}
