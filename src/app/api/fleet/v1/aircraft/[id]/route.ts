import { NextRequest, NextResponse } from "next/server";
import { requireFleetDevice } from "@/lib/fleet-device-auth";
import { FleetServiceError, getFleetAircraftRecord } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireFleetDevice(request);
    const { id } = await context.params;
    const aircraft = await getFleetAircraftRecord(id);
    if (!aircraft) return NextResponse.json({ error: "Aircraft not found." }, { status: 404 });
    return NextResponse.json({ aircraft, generatedAt: new Date().toISOString() });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not load aircraft." }, { status: known ? error.status : 500 });
  }
}
