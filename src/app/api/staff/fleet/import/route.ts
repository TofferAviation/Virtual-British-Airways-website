import { NextRequest, NextResponse } from "next/server";
import { requireFleetPermission } from "@/lib/fleet-auth";
import { FleetServiceError, importFleetAircraft, type FleetImportAircraftInput } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";

type ImportRequest = {
  sourceLabel?: string;
  importId?: string;
  aircraft?: FleetImportAircraftInput[];
};

export async function POST(request: NextRequest) {
  try {
    const { fleetActor } = await requireFleetPermission("fleet.manage");
    const body = await request.json() as ImportRequest;
    if (!body.sourceLabel || !body.importId || !Array.isArray(body.aircraft)) {
      throw new FleetServiceError("Import source, import ID, and aircraft rows are required.", 400);
    }
    const result = await importFleetAircraft(fleetActor, body.sourceLabel, body.importId, body.aircraft);
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    console.error("Fleet bulk import failed", error);
    const known = error instanceof FleetServiceError;
    const diagnostic = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json(
      { error: known ? error.message : process.env.NODE_ENV === "development" ? `Could not import fleet data: ${diagnostic}` : "Could not import fleet data." },
      { status: known ? error.status : 500 },
    );
  }
}
