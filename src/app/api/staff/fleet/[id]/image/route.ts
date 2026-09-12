import { NextRequest, NextResponse } from "next/server";
import { requireFleetPermission } from "@/lib/fleet-auth";
import { FleetServiceError, upsertFleetAircraftImage, type FleetAircraftImageInput } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { fleetActor } = await requireFleetPermission("fleet.manage");
    const { id } = await context.params;
    const body = await request.json() as { image?: FleetAircraftImageInput };
    const image = await upsertFleetAircraftImage(id, fleetActor, body.image ?? {});
    return NextResponse.json({ image });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json(
      { error: known ? error.message : "Could not save aircraft photo." },
      { status: known ? error.status : 500 },
    );
  }
}
