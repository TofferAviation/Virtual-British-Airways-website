import { NextResponse } from "next/server";
import { getVatsimRadarData } from "@/lib/radar-external";

export const dynamic = "force-dynamic";

// VATSIM regenerates its public data every 15 seconds. The server-side helper
// follows that cadence and prevents every BA-Radar visitor from fetching it.
export async function GET() {
  const data = await getVatsimRadarData();
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
