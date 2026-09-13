import { NextResponse } from "next/server";
import { listCurrentFlightStatuses } from "@/lib/flight-status";

export const dynamic = "force-dynamic";

export async function GET() {
  const flights = await listCurrentFlightStatuses();
  return NextResponse.json({ flights, refreshedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
