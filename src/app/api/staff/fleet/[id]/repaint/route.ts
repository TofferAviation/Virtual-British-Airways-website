import { NextRequest, NextResponse } from "next/server";
import { requireFleetPermission } from "@/lib/fleet-auth";
import { FleetServiceError, startFleetRepaint, type FleetRepaintInput } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { fleetActor } = await requireFleetPermission("fleet.manage");
    const body = await request.json() as { repaint?: FleetRepaintInput };
    if (!body.repaint || typeof body.repaint !== "object") throw new FleetServiceError("A repaint event is required.", 400);
    const { id } = await context.params;
    const repaint = await startFleetRepaint(id, fleetActor, body.repaint);
    return NextResponse.json({ repaint }, { status: 201 });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not start repaint." }, { status: known ? error.status : 500 });
  }
}
