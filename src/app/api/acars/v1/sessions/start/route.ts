import { NextResponse } from "next/server";
import { supportedSimulatorLabels, type SupportedSimulator } from "@/lib/acars-contract";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { startAcarsSession } from "@/lib/acars-store";
import { checkAircraftCareerEligibility } from "@/lib/pilot-career";
import { getCareerAircraftAccessPolicy, isCareerEnforcementEnabled } from "@/lib/career-enforcement";
import { getActivePilotBooking } from "@/lib/pilot-operations-store";
import { getPilotById } from "@/lib/pilot-store";
import { ensureFleetMembership, FleetServiceError, getFleetAircraft, startFleetAircraftFlight } from "@/lib/fleet-service";

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
  if (booking.fleetAircraftId && isCareerEnforcementEnabled()) {
    const pilot = await getPilotById(auth.account.id);
    if (!pilot) return NextResponse.json({ error: "Your BAV pilot account could not be verified. Refresh Flight Planning before starting Ember." }, { status: 409 });
    if (getCareerAircraftAccessPolicy(pilot.careerExperience.mode) === "realistic_operations") {
      const aircraft = await getFleetAircraft(booking.fleetAircraftId);
      if (!aircraft) return NextResponse.json({ error: "The selected registration could not be verified. Refresh Flight Planning before starting Ember." }, { status: 409 });
      const eligibility = await checkAircraftCareerEligibility(pilot, aircraft.aircraftModel);
      if (!eligibility.eligible) return NextResponse.json({ error: `Flight start blocked: ${eligibility.reasons.join(" ")}` }, { status: 403 });
    }
  }

  // Fleet must enter the operating state before Ember flies. The arrival
  // reconciler only relocates a registration that it can prove was operating,
  // which is what makes the same airframe available at the destination for
  // its return sector.
  if (booking.fleetAircraftId) {
    const actor = { subject: `bav:${auth.account.id}`, displayName: auth.account.name, fleetRole: "pilot" };
    try {
      await ensureFleetMembership({ subject: actor.subject, displayName: actor.displayName, websiteRole: "pilot" });
      await startFleetAircraftFlight(booking.fleetAircraftId, actor, {
        pilotSubject: actor.subject,
        pilotDisplayName: actor.displayName,
        flightReference: booking.flightNumber,
        departureStation: booking.from,
        arrivalStation: booking.to,
      });
    } catch (error) {
      const message = error instanceof FleetServiceError ? error.message : "Fleet could not start the selected registration.";
      return NextResponse.json({ error: message }, { status: 409 });
    }
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
