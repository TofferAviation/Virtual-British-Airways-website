import { requireAcarsBearer } from "@/lib/acars-auth";
import { ensureFleetMembership, FleetServiceError, type FleetActor } from "@/lib/fleet-service";

/**
 * Maps an authenticated BAV website account to the pilot identity recorded in
 * Fleet. The desktop receives a time-limited token only; it never stores the
 * user's website password.
 */
export async function requireFleetPilot(request: Request): Promise<FleetActor> {
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
  return actor;
}
