import { NextRequest, NextResponse } from "next/server";
import { requireFleetPermission } from "@/lib/fleet-auth";
import {
  FleetServiceError,
  relocateEligibleFleetAircraft,
  relocateFleetAircraft,
  type FleetAircraftRelocationInput,
  type FleetFleetRelocationInput,
} from "@/lib/fleet-service";

export const dynamic = "force-dynamic";

type RelocationRequest = {
  scope?: "aircraft" | "fleet";
  aircraftId?: string;
  station?: string;
  reason?: string;
  expectedVersion?: number;
};

export async function POST(request: NextRequest) {
  try {
    const { fleetActor } = await requireFleetPermission("fleet.manage");
    const body = await request.json() as { relocation?: RelocationRequest };
    const relocation = body.relocation;
    if (!relocation || typeof relocation !== "object") {
      throw new FleetServiceError("A relocation request is required.", 400);
    }

    const station = typeof relocation.station === "string" ? relocation.station : "";
    const reason = typeof relocation.reason === "string" ? relocation.reason : "";
    if (relocation.scope === "fleet") {
      const result = await relocateEligibleFleetAircraft(fleetActor, { station, reason } satisfies FleetFleetRelocationInput);
      return NextResponse.json({ result });
    }

    if (relocation.scope !== "aircraft" || !relocation.aircraftId || typeof relocation.expectedVersion !== "number") {
      throw new FleetServiceError("Choose an aircraft and refresh its record before relocating it.", 400);
    }
    const aircraft = await relocateFleetAircraft(relocation.aircraftId, fleetActor, {
      station,
      reason,
      expectedVersion: relocation.expectedVersion,
    } satisfies FleetAircraftRelocationInput);
    return NextResponse.json({ aircraft });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json(
      { error: known ? error.message : "Could not relocate the aircraft." },
      { status: known ? error.status : 500 },
    );
  }
}
