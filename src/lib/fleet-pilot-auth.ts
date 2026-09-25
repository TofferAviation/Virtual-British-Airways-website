import { requireAcarsBearer } from "@/lib/acars-auth";
import { ensureFleetMembership, fleetAircraftMatchesVirtualType, FleetServiceError, getFleetAircraft, type FleetActor } from "@/lib/fleet-service";
import { getPilotAircraftEligibility } from "@/lib/pilot-ranks";
import { getActivePilotBooking } from "@/lib/pilot-operations-store";
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

/**
 * Fleet reservations and starts must use the same type as the pilot's current
 * BAV assignment. This makes the selected registration, Ember cabin profile,
 * aircraft hours and PIREP all refer to one actual virtual airframe.
 */
export async function requireFleetPilotAircraftForActiveBooking(actor: FleetPilotActor, aircraftId: string) {
  const [result, booking] = await Promise.all([
    requireFleetPilotAircraftEligibility(actor, aircraftId),
    getActivePilotBooking(actor.pilotId),
  ]);
  if (!booking) throw new FleetServiceError("Choose a BAV flight before reserving an aircraft registration.", 409);
  if (!fleetAircraftMatchesVirtualType(result.aircraft, booking.aircraft)) {
    throw new FleetServiceError(`This assignment is for ${booking.aircraft}. Reserve a matching registration, or update the virtual aircraft in Flight Planning before you start Ember.`, 409);
  }
  if (booking.fleetAircraftId && booking.fleetAircraftId !== aircraftId) {
    throw new FleetServiceError(`Your BAV booking has reserved ${booking.registration ?? "a specific registration"}. Ember must use that selected airframe for this flight.`, 409);
  }
  return { ...result, booking };
}
