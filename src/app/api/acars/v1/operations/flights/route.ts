import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { getActivePilotBooking } from "@/lib/pilot-operations-store";
import { listOperationsRosterFlights } from "@/lib/operations-roster";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [flights, ownAssignment] = await Promise.all([
    listOperationsRosterFlights(),
    getActivePilotBooking(auth.account.id),
  ]);
  return NextResponse.json({
    flights: flights.map((flight) => ({
      ...flight,
      isCurrentPilot: flight.id === ownAssignment?.id,
    })),
  });
}
