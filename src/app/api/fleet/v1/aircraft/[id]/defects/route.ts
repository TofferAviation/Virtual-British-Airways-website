import { NextRequest, NextResponse } from "next/server";
import { requireFleetDevice } from "@/lib/fleet-device-auth";
import { FleetServiceError, reportFleetDefect, type FleetDefectInput } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requireFleetDevice(request);
    const body = await request.json() as { defect?: FleetDefectInput };
    if (!body.defect || typeof body.defect !== "object") throw new FleetServiceError("A defect report is required.", 400);
    const { id } = await context.params;
    const defect = await reportFleetDefect(id, actor, { ...body.defect, source: body.defect.source ?? "cabin_crew" });
    return NextResponse.json({ defect }, { status: 201 });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not report defect." }, { status: known ? error.status : 500 });
  }
}
