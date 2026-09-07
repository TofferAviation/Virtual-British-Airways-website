import { NextRequest, NextResponse } from "next/server";
import {
  allPermissions,
  expandPermissionDependencies,
  permissionLabel,
  SERVICE_SOURCE_PERMISSION,
  type PermissionId,
  type StaffRoleId,
} from "@/lib/permissions";
import { getStaffSession } from "@/lib/staff-auth";
import {
  addAudit,
  createStaffInvitation,
  getRole,
  getStaffState,
  hasPermission,
  permissionsForUser,
  saveStaffState,
  type StaffAccount,
} from "@/lib/staff-store";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function actorWithState() {
  const session = await getStaffSession();
  if (!session) return null;
  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!actor) return null;
  return { session, state, actor };
}

function publicUser(user: StaffAccount) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  void _passwordHash;
  return safeUser;
}

function safeOverrides(value: unknown) {
  const output: Partial<Record<PermissionId, boolean>> = {};
  if (!value || typeof value !== "object") return output;
  const raw = value as Record<string, unknown>;
  for (const permission of allPermissions) {
    if (typeof raw[permission] === "boolean") output[permission] = raw[permission] as boolean;
  }
  return output;
}

function safePermissions(value: unknown) {
  if (!Array.isArray(value)) return [] as PermissionId[];
  return value.filter((item): item is PermissionId => typeof item === "string" && allPermissions.includes(item as PermissionId));
}

export async function GET() {
  const context = await actorWithState();
  if (!context) return jsonError("Staff authentication required.", 401);
  const { state, actor } = context;
  if (!hasPermission(state, actor, "users.view")) return jsonError("You do not have permission to view staff accounts.", 403);

  const currentPermissions = [...permissionsForUser(state, actor)];
  const audit = hasPermission(state, actor, "settings.audit") ? state.audit.slice(0, 30) : [];
  const invitations = hasPermission(state, actor, "users.roles")
    ? state.invitations.map(({ tokenHash: _tokenHash, ...invitation }) => {
        void _tokenHash;
        return invitation;
      })
    : [];

  return NextResponse.json({
    users: state.users.map(publicUser),
    roles: state.roles,
    invitations,
    audit,
    currentUserId: actor.id,
    currentPermissions,
  });
}

export async function POST(request: NextRequest) {
  const context = await actorWithState();
  if (!context) return jsonError("Staff authentication required.", 401);
  const { state, actor } = context;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "save-user") {
    if (!hasPermission(state, actor, "users.roles")) return jsonError("You do not have permission to assign staff roles.", 403);
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const roleId = typeof body?.roleId === "string" ? (body.roleId as StaffRoleId) : "";
    const user = state.users.find((item) => item.id === userId);
    if (!user) return jsonError("Staff account not found.", 404);
    if (user.isEnvironmentAdmin) return jsonError("The environment administrator always keeps full Admin access.", 409);
    if (!getRole(state, roleId)) return jsonError("Selected role does not exist.");

    const beforeRole = user.roleId;
    const before = permissionsForUser(state, user);
    const beforeSourceAccess = before.has(SERVICE_SOURCE_PERMISSION);
    const existingSourceOverride = user.overrides[SERVICE_SOURCE_PERMISSION];

    user.roleId = roleId;
    user.overrides = safeOverrides(body?.overrides);

    // The normal User Permissions page is never allowed to grant or remove source access.
    // Preserve an explicit Master Admin override when one exists. If the role change itself
    // would change effective source access, add an invisible override that keeps the previous
    // effective state until the Master Admin changes it from Service Settings.
    if (typeof existingSourceOverride === "boolean") {
      user.overrides[SERVICE_SOURCE_PERMISSION] = existingSourceOverride;
    } else {
      const newRoleGrantsSource = Boolean(getRole(state, roleId)?.permissions.includes(SERVICE_SOURCE_PERMISSION));
      if (newRoleGrantsSource !== beforeSourceAccess) {
        user.overrides[SERVICE_SOURCE_PERMISSION] = beforeSourceAccess;
      }
    }

    const after = permissionsForUser(state, user);

    if (beforeRole !== roleId) {
      addAudit(state, {
        actorEmail: actor.email,
        actorName: actor.name,
        action: "permissions.role.changed",
        targetUserId: user.id,
        targetName: user.name,
        details: `Changed role from ${getRole(state, beforeRole)?.name ?? beforeRole} to ${getRole(state, roleId)?.name ?? roleId}. Protected Service Settings access was left unchanged.`,
      });
    }

    for (const permission of allPermissions) {
      if (before.has(permission) === after.has(permission)) continue;
      addAudit(state, {
        actorEmail: actor.email,
        actorName: actor.name,
        action: "permissions.changed",
        targetUserId: user.id,
        targetName: user.name,
        details: `${permissionLabel(permission)}: ${before.has(permission) ? "ON" : "OFF"} → ${after.has(permission) ? "ON" : "OFF"}.`,
      });
    }

    await saveStaffState(state);
    return NextResponse.json({ user: publicUser(user), audit: state.audit.slice(0, 30) });
  }

  if (action === "remove-staff") {
    if (!hasPermission(state, actor, "users.roles")) return jsonError("You do not have permission to remove staff access.", 403);
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const user = state.users.find((item) => item.id === userId);
    if (!user) return jsonError("Staff account not found.", 404);
    if (user.isEnvironmentAdmin) return jsonError("The environment administrator cannot be deactivated here.", 409);
    if (user.id === actor.id) return jsonError("You cannot remove your own staff access.", 409);
    user.status = "inactive";
    user.overrides = {};
    addAudit(state, {
      actorEmail: actor.email,
      actorName: actor.name,
      action: "staff.access.removed",
      targetUserId: user.id,
      targetName: user.name,
      details: `Removed staff access from ${user.name}. Their pilot account is unchanged.`,
    });
    await saveStaffState(state);
    return NextResponse.json({ user: publicUser(user), audit: state.audit.slice(0, 30) });
  }

  if (action === "invite") {
    if (!hasPermission(state, actor, "users.roles")) return jsonError("You do not have permission to invite staff.", 403);
    const email = typeof body?.email === "string" ? body.email : "";
    const name = typeof body?.name === "string" ? body.name : "";
    const roleId = typeof body?.roleId === "string" ? (body.roleId as StaffRoleId) : "events";
    const message = typeof body?.message === "string" ? body.message : undefined;
    try {
      const { invitation, token } = await createStaffInvitation({
        email,
        name,
        roleId,
        message,
        actorEmail: actor.email,
        actorName: actor.name,
      });
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";
      return NextResponse.json({
        invitation: { ...invitation, tokenHash: undefined },
        invitationUrl: `${baseUrl}/staff-invite/${token}`,
      }, { status: 201 });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Could not create invitation.");
    }
  }

  if (action === "revoke-invitation") {
    if (!hasPermission(state, actor, "users.roles")) return jsonError("You do not have permission to manage invitations.", 403);
    const invitationId = typeof body?.invitationId === "string" ? body.invitationId : "";
    const invitation = state.invitations.find((item) => item.id === invitationId);
    if (!invitation) return jsonError("Invitation not found.", 404);
    invitation.status = "revoked";
    addAudit(state, {
      actorEmail: actor.email,
      actorName: actor.name,
      action: "staff.invitation.revoked",
      targetName: invitation.name,
      details: `Revoked staff invitation for ${invitation.email}.`,
    });
    await saveStaffState(state);
    return NextResponse.json({ ok: true, audit: state.audit.slice(0, 30) });
  }

  if (action === "create-role" || action === "update-role") {
    if (!hasPermission(state, actor, "settings.roles")) return jsonError("You do not have permission to manage role templates.", 403);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const permissions = [...expandPermissionDependencies(safePermissions(body?.permissions))];
    if (!name) return jsonError("Role name is required.");

    if (action === "create-role") {
      const idBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "role";
      let id = idBase;
      let suffix = 2;
      while (state.roles.some((role) => role.id === id)) id = `${idBase}-${suffix++}`;
      const role = { id, name, description, permissions, system: false };
      state.roles.push(role);
      addAudit(state, {
        actorEmail: actor.email,
        actorName: actor.name,
        action: "role.created",
        details: `Created role ${name} with ${permissions.length} standard permissions. Protected Service Settings access can only be granted by Master Admin from Service Settings.`,
      });
      await saveStaffState(state);
      return NextResponse.json({ role, audit: state.audit.slice(0, 30) }, { status: 201 });
    }

    const roleId = typeof body?.roleId === "string" ? body.roleId : "";
    const role = state.roles.find((item) => item.id === roleId);
    if (!role) return jsonError("Role not found.", 404);
    if (role.id === "admin") return jsonError("The Admin role always keeps full standard access.", 409);
    const sourceWasGranted = role.permissions.includes(SERVICE_SOURCE_PERMISSION);
    role.name = name;
    role.description = description;
    role.permissions = sourceWasGranted ? [...permissions, SERVICE_SOURCE_PERMISSION] : permissions;
    addAudit(state, {
      actorEmail: actor.email,
      actorName: actor.name,
      action: "role.updated",
      details: `Updated role ${name}; standard permissions changed while protected Service Settings access was preserved.`,
    });
    await saveStaffState(state);
    return NextResponse.json({ role, audit: state.audit.slice(0, 30) });
  }

  return jsonError("Unknown permissions action.");
}
