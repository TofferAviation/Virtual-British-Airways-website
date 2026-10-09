import { NextResponse } from "next/server";
import { getRadarAuroraData } from "@/lib/radar-external";

export const dynamic = "force-dynamic";

// NOAA SWPC's operational OVATION Prime forecast is refreshed upstream on a
// short cadence. The server-side cache keeps the public map courteous to that
// service while still updating the auroral oval every five minutes.
export async function GET() {
  return NextResponse.json(await getRadarAuroraData(), { headers: { "Cache-Control": "no-store" } });
}
