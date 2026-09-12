import { NextRequest, NextResponse } from "next/server";
import { requireFleetDevice } from "@/lib/fleet-device-auth";
import { FleetServiceError, listFleetAircraft } from "@/lib/fleet-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireFleetDevice(request);
    const registration = request.nextUrl.searchParams.get("registration")?.trim().toUpperCase();
    const aircraft = await listFleetAircraft();
    return NextResponse.json({ aircraft: registration ? aircraft.filter((item) => item.registration === registration) : aircraft, generatedAt: new Date().toISOString() });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not load fleet data." }, { status: known ? error.status : 500 });
  }
}
