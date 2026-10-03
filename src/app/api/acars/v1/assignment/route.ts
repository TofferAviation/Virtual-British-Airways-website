import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { checkAircraftCareerEligibility } from "@/lib/pilot-career";
import { getCareerAircraftAccessPolicy, isCareerEnforcementEnabled } from "@/lib/career-enforcement";
import { getActivePilotBooking, getPilotFlightPlan } from "@/lib/pilot-operations-store";
import { getPilotById } from "@/lib/pilot-store";
import { getSimbriefCodes } from "@/lib/simbrief";
import { getFleetAircraft } from "@/lib/fleet-service";

export async function GET(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const assignment = await getActivePilotBooking(auth.account.id);
  const codes = assignment ? getSimbriefCodes(assignment) : null;
  // Ember receives only the authenticated pilot's briefing for the active
  // booking. It must not query an arbitrary latest SimBrief OFP locally.
  const flightPlan = assignment
    ? await getPilotFlightPlan(assignment.id, auth.account.id)
    : null;
  let careerNotice: string | null = null;
  if (assignment?.fleetAircraftId && isCareerEnforcementEnabled()) {
    const pilot = await getPilotById(auth.account.id);
    if (!pilot) careerNotice = "Your BAV pilot account could not be verified. Refresh Flight Planning before starting Ember.";
    else if (getCareerAircraftAccessPolicy(pilot.careerExperience.mode) === "realistic_operations") {
      const aircraft = await getFleetAircraft(assignment.fleetAircraftId);
      if (!aircraft) careerNotice = "The selected registration could not be checked. Refresh Flight Planning before starting Ember.";
      else {
        const eligibility = await checkAircraftCareerEligibility(pilot, aircraft.aircraftModel);
        careerNotice = eligibility.eligible
          ? `Qualification verified: ${eligibility.requiredRating?.replaceAll("_", " ") ?? "operational"} · ${eligibility.role.replaceAll("_", " ")}.`
          : `Flight start blocked: ${eligibility.reasons.join(" ")}`;
      }
    }
  }
  return NextResponse.json({
    assignment: assignment
      ? {
          ...assignment,
          originIcao: codes?.origin ?? null,
          destinationIcao: codes?.destination ?? null,
          careerNotice,
          briefing: flightPlan
            ? {
                status: flightPlan.status,
                route: flightPlan.route,
                cruiseAltitude: flightPlan.cruiseAltitude,
                alternate: flightPlan.alternate,
                generatedAt: flightPlan.generatedAt,
                briefing: flightPlan.simbriefBriefing,
              }
            : null,
        }
      : null,
  });
}
