import { NextRequest, NextResponse } from "next/server";
import { requireFleetPermission } from "@/lib/fleet-auth";
import { FleetServiceError, reportFleetDamage, type FleetDamageInput } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { fleetActor } = await requireFleetPermission("fleet.defects.report");
    const body = await request.json() as { damage?: FleetDamageInput };
    if (!body.damage || typeof body.damage !== "object") throw new FleetServiceError("A damage report is required.", 400);
    const { id } = await context.params;
    const damage = await reportFleetDamage(id, fleetActor, body.damage);
    return NextResponse.json({ damage }, { status: 201 });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not report damage." }, { status: known ? error.status : 500 });
  }
}
