import { requireAcarsBearer } from "@/lib/acars-auth";
import { ensureFleetMembership, FleetServiceError, getFleetAircraft, type FleetActor } from "@/lib/fleet-service";
import { getPilotAircraftEligibility } from "@/lib/pilot-ranks";
import { getPilotById } from "@/lib/pilot-store";

export type FleetPilotActor = FleetActor & { pilotId: string };

/**
 * Maps an authenticated BAV website account to the pilot identity recorded in
 * Fleet. The desktop receives a time-limited token only; it never stores the
 * user's website password.
 */
export async function requireFleetPilot(request: Request): Promise<FleetPilotActor> {
  const auth = await requireAcarsBearer(request);
  if (!auth) throw new FleetServiceError("Sign in to your British Airways Virtual account to select an aircraft.", 401);

  const actor: FleetActor = {
    subject: `bav:${auth.account.id}`,
    displayName: auth.account.name,
    fleetRole: "pilot",
  };
  await ensureFleetMembership({
    subject: actor.subject,
    displayName: actor.displayName,
    websiteRole: "pilot",
  });
  return { ...actor, pilotId: auth.account.id };
}

/** Enforces the same BAV rank and type-rating policy for Ember fleet actions. */
export async function requireFleetPilotAircraftEligibility(actor: FleetPilotActor, aircraftId: string) {
  const [pilot, aircraft] = await Promise.all([getPilotById(actor.pilotId), getFleetAircraft(aircraftId)]);
  if (!pilot) throw new FleetServiceError("Your BAV pilot account could not be found. Refresh your BAV profile and try again.", 401);
  if (!aircraft) throw new FleetServiceError("Aircraft not found.", 404);
  const eligibility = getPilotAircraftEligibility({ rank: pilot.rank, typeRatings: pilot.typeRatings, aircraft: aircraft.aircraftModel });
  if (!eligibility.eligible) throw new FleetServiceError(eligibility.reason, 403);
  return { pilot, aircraft, eligibility };
}
