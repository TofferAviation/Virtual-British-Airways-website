import { NextResponse } from "next/server";
import { getRadarWeatherData } from "@/lib/radar-external";

export const dynamic = "force-dynamic";

// Weather is intentionally cached in the application: precipitation, modelled
// winds and aviation advisories do not benefit from a per-visitor fetch.
export async function GET() {
  const data = await getRadarWeatherData();
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
