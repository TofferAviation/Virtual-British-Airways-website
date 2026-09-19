import { NextResponse } from "next/server";
import { getRadarGfsWindGrid } from "@/lib/radar-gfs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const windGrid = await getRadarGfsWindGrid(new URL(request.url).searchParams.get("windLayer"));
    return NextResponse.json(windGrid, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The NOAA GFS wind field is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
