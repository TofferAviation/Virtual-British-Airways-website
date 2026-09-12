import { NextRequest, NextResponse } from "next/server";
import { requireFleetPilot } from "@/lib/fleet-pilot-auth";
import { cancelFleetAircraftReservation, FleetServiceError, reserveFleetAircraftForFlight, type FleetFlightAssignmentInput } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requireFleetPilot(request);
    const body = await request.json() as { assignment?: FleetFlightAssignmentInput };
    if (!body.assignment || typeof body.assignment !== "object") throw new FleetServiceError("A flight assignment is required.", 400);
    const { id } = await context.params;
    const assignment = await reserveFleetAircraftForFlight(id, actor, { ...body.assignment, pilotSubject: actor.subject, pilotDisplayName: actor.displayName });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not reserve aircraft." }, { status: known ? error.status : 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requireFleetPilot(request);
    const body = await request.json() as { assignment?: FleetFlightAssignmentInput };
    if (!body.assignment || typeof body.assignment !== "object") throw new FleetServiceError("A flight assignment is required.", 400);
    const { id } = await context.params;
    const assignment = await cancelFleetAircraftReservation(id, actor, { ...body.assignment, pilotSubject: actor.subject, pilotDisplayName: actor.displayName });
    return NextResponse.json({ assignment });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not release aircraft reservation." }, { status: known ? error.status : 500 });
  }
}
