import type { PermissionId } from "@/lib/permissions";
import { getStaffSession } from "@/lib/staff-auth";
import { getStaffState, hasPermission } from "@/lib/staff-store";
import { ensureFleetMembership, fleetRoleCodeForWebsiteRole, FleetServiceError } from "@/lib/fleet-service";

export async function requireFleetPermission(permission: PermissionId) {
  const session = await getStaffSession();
  if (!session) throw new FleetServiceError("Staff authentication required.", 401);

  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!actor || !hasPermission(state, actor, permission)) {
    throw new FleetServiceError(`Permission required: ${permission}.`, 403);
  }

  await ensureFleetMembership({
    subject: actor.id,
    displayName: actor.name,
    websiteRole: actor.roleId,
  });

  return {
    session,
    actor,
    fleetActor: {
      subject: actor.id,
      displayName: actor.name,
      fleetRole: fleetRoleCodeForWebsiteRole(actor.roleId),
    },
  };
}
