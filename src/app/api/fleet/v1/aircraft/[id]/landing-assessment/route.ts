import { NextRequest, NextResponse } from "next/server";
import { requireFleetDevice } from "@/lib/fleet-device-auth";
import { FleetServiceError, recordFleetHardLanding, type FleetHardLandingInput } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requireFleetDevice(request);
    const body = await request.json() as { landing?: FleetHardLandingInput };
    if (!body.landing || typeof body.landing !== "object") throw new FleetServiceError("A landing assessment is required.", 400);
    const { id } = await context.params;
    const assessment = await recordFleetHardLanding(id, actor, body.landing);
    return NextResponse.json({ assessment }, { status: 201 });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not record the hard-landing assessment." }, { status: known ? error.status : 500 });
  }
}
