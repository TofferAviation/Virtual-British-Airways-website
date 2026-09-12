import { NextRequest, NextResponse } from "next/server";
import { requireFleetPermission } from "@/lib/fleet-auth";
import { createFleetAircraft, FleetServiceError, listFleetAircraft, type CreateFleetAircraftInput } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireFleetPermission("fleet.view");
    const aircraft = await listFleetAircraft();
    return NextResponse.json({ aircraft });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json(
      { error: known ? error.message : "Could not load fleet data." },
      { status: known ? error.status : 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { fleetActor } = await requireFleetPermission("fleet.manage");
    const body = await request.json() as { aircraft?: CreateFleetAircraftInput };
    if (!body.aircraft || typeof body.aircraft !== "object") {
      throw new FleetServiceError("An aircraft master record is required.", 400);
    }
    const aircraft = await createFleetAircraft(fleetActor, body.aircraft);
    return NextResponse.json({ aircraft }, { status: 201 });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json(
      { error: known ? error.message : "Could not create aircraft." },
      { status: known ? error.status : 500 },
    );
  }
}
