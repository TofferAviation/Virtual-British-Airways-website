import { NextResponse } from "next/server";
import { getRadarWeatherData } from "@/lib/radar-external";

export const dynamic = "force-dynamic";

// Weather is intentionally cached in the application: precipitation and
// aviation advisories do not benefit from a per-visitor fetch. GFS wind data
// has its own efficient endpoint because it is substantially denser.
export async function GET() {
  const data = await getRadarWeatherData();
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
