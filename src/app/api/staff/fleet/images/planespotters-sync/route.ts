import { NextResponse } from "next/server";
import { requireFleetPermission } from "@/lib/fleet-auth";
import { FleetServiceError, syncFleetAircraftImagesFromPlanespotters } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    const { fleetActor } = await requireFleetPermission("fleet.manage");
    const result = await syncFleetAircraftImagesFromPlanespotters(fleetActor);
    return NextResponse.json({ result });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json(
      { error: known ? error.message : "Could not synchronize Planespotters aircraft photos." },
      { status: known ? error.status : 500 },
    );
  }
}
