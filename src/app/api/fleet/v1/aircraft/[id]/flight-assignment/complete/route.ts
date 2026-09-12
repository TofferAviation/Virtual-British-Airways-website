import { NextRequest, NextResponse } from "next/server";
import { completeFleetAircraftFlight, FleetServiceError, type FleetFlightAssignmentInput } from "@/lib/fleet-service";
import { requireFleetPilot } from "@/lib/fleet-pilot-auth";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requireFleetPilot(request);
    const body = await request.json() as { assignment?: FleetFlightAssignmentInput };
    if (!body.assignment || typeof body.assignment !== "object") throw new FleetServiceError("A flight assignment is required.", 400);
    const { id } = await context.params;
    const assignment = await completeFleetAircraftFlight(id, actor, { ...body.assignment, pilotSubject: actor.subject, pilotDisplayName: actor.displayName });
    return NextResponse.json({ assignment });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not complete aircraft operation." }, { status: known ? error.status : 500 });
  }
}
