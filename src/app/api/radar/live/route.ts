import { NextResponse } from "next/server";
import { listPublicRadarFlights } from "@/lib/radar-live";

export const dynamic = "force-dynamic";

export async function GET() {
  const flights = await listPublicRadarFlights();

  return NextResponse.json(
    { flights, refreshedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
