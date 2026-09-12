import { NextRequest, NextResponse } from "next/server";
import { requireFleetPermission } from "@/lib/fleet-auth";
import { FleetServiceError, transitionFleetDefect, type FleetDefectTransitionInput } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string; defectId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { fleetActor } = await requireFleetPermission("fleet.defects.manage");
    const body = await request.json() as { transition?: FleetDefectTransitionInput };
    if (!body.transition || typeof body.transition !== "object") throw new FleetServiceError("A defect transition is required.", 400);
    const { defectId } = await context.params;
    const defect = await transitionFleetDefect(defectId, fleetActor, body.transition);
    return NextResponse.json({ defect });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not update defect." }, { status: known ? error.status : 500 });
  }
}
