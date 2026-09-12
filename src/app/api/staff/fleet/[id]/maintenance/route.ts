import { NextRequest, NextResponse } from "next/server";
import { requireFleetPermission } from "@/lib/fleet-auth";
import { createFleetMaintenanceEvent, FleetServiceError, type FleetMaintenanceInput } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { fleetActor } = await requireFleetPermission("fleet.maintenance.manage");
    const body = await request.json() as { maintenance?: FleetMaintenanceInput };
    if (!body.maintenance || typeof body.maintenance !== "object") throw new FleetServiceError("A maintenance event is required.", 400);
    const { id } = await context.params;
    const maintenance = await createFleetMaintenanceEvent(id, fleetActor, body.maintenance);
    return NextResponse.json({ maintenance }, { status: 201 });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not create maintenance event." }, { status: known ? error.status : 500 });
  }
}
