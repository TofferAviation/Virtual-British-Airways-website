import { NextRequest, NextResponse } from "next/server";
import { requireFleetPermission } from "@/lib/fleet-auth";
import { FleetServiceError, transitionFleetAircraftStatus, type FleetStatusTransitionInput } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const body = await request.json() as { transition?: FleetStatusTransitionInput };
    if (!body.transition || typeof body.transition !== "object") {
      throw new FleetServiceError("A status transition is required.", 400);
    }
    const permission = body.transition.action === "release_to_service" ? "fleet.release_to_service" : "fleet.manage";
    const { fleetActor } = await requireFleetPermission(permission);
    const { id } = await context.params;
    const aircraft = await transitionFleetAircraftStatus(id, fleetActor, body.transition);
    return NextResponse.json({ aircraft });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not update aircraft status." }, { status: known ? error.status : 500 });
  }
}
