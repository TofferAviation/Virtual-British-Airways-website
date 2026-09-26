import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { checkAircraftCareerEligibility } from "@/lib/pilot-career";
import { getActivePilotBooking } from "@/lib/pilot-operations-store";
import { getPilotById } from "@/lib/pilot-store";
import { getSimbriefCodes } from "@/lib/simbrief";
import { getFleetAircraft } from "@/lib/fleet-service";

export async function GET(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const assignment = await getActivePilotBooking(auth.account.id);
  const codes = assignment ? getSimbriefCodes(assignment) : null;
  let careerNotice: string | null = null;
  if (assignment?.fleetAircraftId && process.env.BAV_CAREER_ENFORCEMENT === "true") {
    const [pilot, aircraft] = await Promise.all([getPilotById(auth.account.id), getFleetAircraft(assignment.fleetAircraftId)]);
    if (!pilot || !aircraft) careerNotice = "The selected registration could not be checked. Refresh Flight Planning before starting Ember.";
    else {
      const eligibility = await checkAircraftCareerEligibility(pilot, aircraft.aircraftModel);
      careerNotice = eligibility.eligible
        ? `Qualification verified: ${eligibility.requiredRating?.replaceAll("_", " ") ?? "operational"} · ${eligibility.role.replaceAll("_", " ")}.`
        : `Flight start blocked: ${eligibility.reasons.join(" ")}`;
    }
  }
  return NextResponse.json({
    assignment: assignment
      ? { ...assignment, originIcao: codes?.origin ?? null, destinationIcao: codes?.destination ?? null, careerNotice }
      : null,
  });
}
