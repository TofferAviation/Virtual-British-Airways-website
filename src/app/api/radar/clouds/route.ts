import { NextResponse } from "next/server";
import { getRadarCloudData } from "@/lib/radar-clouds";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getRadarCloudData(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The NOAA GFS cloud model is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
