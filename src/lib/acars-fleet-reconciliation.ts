import type { AcarsSession } from "@/lib/acars-store";
import { toBritishAirwaysFlightNumber } from "@/lib/ba-flight-identifiers";
import type { AcarsArrivalResolution } from "@/lib/acars-arrival";
import { completeFleetAircraftFlight, ensureFleetMembership, getActiveFleetFlightAssignmentForPilot } from "@/lib/fleet-service";

export type FleetArrivalReconciliation = {
  status: "updated" | "not_managed" | "awaiting_arrival_verification" | "not_operating" | "flight_mismatch" | "unavailable";
  message: string;
};

/**
 * Makes the ACARS arrival result the fleet's source of truth. Importantly, a
 * planned destination is never passed to Fleet when Ember could not verify it.
 */
export async function reconcileFleetArrival(session: AcarsSession, arrival: AcarsArrivalResolution): Promise<FleetArrivalReconciliation> {
  if (!arrival.canUpdateFleet || !arrival.actualStation) {
    return { status: "awaiting_arrival_verification", message: "Fleet station was not changed because the arrival airport could not be verified." };
  }

  const actor = { subject: `bav:${session.pilotId}`, displayName: session.pilotName, fleetRole: "pilot" };
  try {
    await ensureFleetMembership({ subject: actor.subject, displayName: actor.displayName, websiteRole: "pilot" });
    const assignment = await getActiveFleetFlightAssignmentForPilot(actor);
    if (!assignment) return { status: "not_managed", message: "No active Fleet registration was attached to this Ember flight." };
    if (toBritishAirwaysFlightNumber(assignment.flightReference) !== toBritishAirwaysFlightNumber(session.flightNumber)) {
      return { status: "flight_mismatch", message: "A different Fleet flight is active, so Ember did not change its aircraft station." };
    }
    if (assignment.status !== "operating") {
      return { status: "not_operating", message: "The Fleet registration has not been marked operating, so Ember did not complete it." };
    }
    await completeFleetAircraftFlight(assignment.aircraftId, actor, {
      pilotSubject: actor.subject,
      pilotDisplayName: actor.displayName,
      flightReference: assignment.flightReference,
      departureStation: assignment.departureStation ?? session.from,
      arrivalStation: arrival.actualStation,
    });
    return { status: "updated", message: `Fleet updated to ${arrival.actualStation}.` };
  } catch (error) {
    console.error("[acars] Could not reconcile Fleet arrival.", error);
    return { status: "unavailable", message: "The PIREP was saved, but Fleet could not be updated right now." };
  }
}
