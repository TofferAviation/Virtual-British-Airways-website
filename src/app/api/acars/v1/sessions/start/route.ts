import { NextResponse } from "next/server";
import { supportedSimulatorLabels, type SupportedSimulator } from "@/lib/acars-contract";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { startAcarsSession } from "@/lib/acars-store";
import { checkAircraftCareerEligibility } from "@/lib/pilot-career";
import { getActivePilotBooking } from "@/lib/pilot-operations-store";
import { getPilotById } from "@/lib/pilot-store";
import { getFleetAircraft } from "@/lib/fleet-service";

function isSupportedSimulator(value: string): value is SupportedSimulator {
  return value in supportedSimulatorLabels;
}

export async function POST(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { simulator?: string } | null;
  const simulator = body?.simulator ?? "";
  if (!isSupportedSimulator(simulator)) return NextResponse.json({ error: "Unsupported simulator." }, { status: 400 });
  const booking = await getActivePilotBooking(auth.account.id);
  if (!booking) return NextResponse.json({ error: "No active BAV assignment." }, { status: 409 });
  if (booking.fleetAircraftId && process.env.BAV_CAREER_ENFORCEMENT === "true") {
    const [pilot, aircraft] = await Promise.all([getPilotById(auth.account.id), getFleetAircraft(booking.fleetAircraftId)]);
    if (!pilot || !aircraft) return NextResponse.json({ error: "The selected registration could not be verified. Refresh Flight Planning before starting Ember." }, { status: 409 });
    const eligibility = await checkAircraftCareerEligibility(pilot, aircraft.aircraftModel);
    if (!eligibility.eligible) return NextResponse.json({ error: `Flight start blocked: ${eligibility.reasons.join(" ")}` }, { status: 403 });
  }

  const session = await startAcarsSession({
    pilotId: auth.account.id,
    pilotNumber: auth.account.pilotNumber,
    pilotName: auth.account.name,
    bookingId: booking.id,
    flightNumber: booking.flightNumber,
    from: booking.from,
    to: booking.to,
    aircraft: booking.aircraft,
    simulator,
  });

  return NextResponse.json({ session });
}
