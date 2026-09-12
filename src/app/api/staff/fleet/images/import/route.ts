import { NextRequest, NextResponse } from "next/server";
import { requireFleetPermission } from "@/lib/fleet-auth";
import { FleetServiceError, importFleetAircraftImages, type FleetAircraftImageImportInput } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { fleetActor } = await requireFleetPermission("fleet.manage");
    const body = await request.json() as { images?: FleetAircraftImageImportInput[] };
    const result = await importFleetAircraftImages(fleetActor, body.images ?? []);
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json(
      { error: known ? error.message : "Could not import aircraft photo catalogue." },
      { status: known ? error.status : 500 },
    );
  }
}
