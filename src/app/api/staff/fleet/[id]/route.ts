import { NextRequest, NextResponse } from "next/server";
import { requireFleetPermission } from "@/lib/fleet-auth";
import { FleetServiceError, getFleetAircraftRecord } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireFleetPermission("fleet.view");
    const { id } = await context.params;
    const aircraft = await getFleetAircraftRecord(id);
    if (!aircraft) return NextResponse.json({ error: "Aircraft not found." }, { status: 404 });
    return NextResponse.json({ aircraft });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json(
      { error: known ? error.message : "Could not load aircraft." },
      { status: known ? error.status : 500 },
    );
  }
}
