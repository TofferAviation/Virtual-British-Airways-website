import { NextRequest, NextResponse } from "next/server";
import { SERVICE_SOURCE_PERMISSION } from "@/lib/permissions";
import { getStaffSession } from "@/lib/staff-auth";
import {
  addAudit,
  getRole,
  getStaffState,
  hasPermission,
  isMasterAdminAccount,
  saveStaffState,
} from "@/lib/staff-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function masterContext() {
  const session = await getStaffSession();
  if (!session) return null;
  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!actor || !isMasterAdminAccount(actor)) return null;
  return { state, actor };
}

function publicAccessState(state: Awaited<ReturnType<typeof getStaffState>>) {
  return {
    roles: state.roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      granted: role.permissions.includes(SERVICE_SOURCE_PERMISSION),
    })),
    users: state.users
      .filter((user) => !isMasterAdminAccount(user))
      .map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.roleId,
        status: user.status,
        roleGranted: Boolean(getRole(state, user.roleId)?.permissions.includes(SERVICE_SOURCE_PERMISSION)),
        override: typeof user.overrides[SERVICE_SOURCE_PERMISSION] === "boolean" ? user.overrides[SERVICE_SOURCE_PERMISSION] : null,
        effective: hasPermission(state, user, SERVICE_SOURCE_PERMISSION),
      })),
  };
}

export async function GET() {
  const context = await masterContext();
  if (!context) return jsonError("Only the Master Admin can manage Service Settings access.", 403);
  return NextResponse.json(publicAccessState(context.state));
}

export async function POST(request: NextRequest) {
  const context = await masterContext();
  if (!context) return jsonError("Only the Master Admin can manage Service Settings access.", 403);
  const { state, actor } = context;
  const body = (await request.json().catch(() => null)) as {
    targetType?: unknown;
    id?: unknown;
    access?: unknown;
  } | null;
  const targetType = body?.targetType;
  const id = typeof body?.id === "string" ? body.id : "";
  const access = body?.access;
  if ((targetType !== "role" && targetType !== "user") || !id) return jsonError("Choose a role or staff account.");
  if (access !== "on" && access !== "off" && access !== "inherit") return jsonError("Invalid access setting.");

  if (targetType === "role") {
    const role = state.roles.find((item) => item.id === id);
    if (!role) return jsonError("Role not found.", 404);
    const before = role.permissions.includes(SERVICE_SOURCE_PERMISSION);
    const next = access === "on";
    role.permissions = role.permissions.filter((permission) => permission !== SERVICE_SOURCE_PERMISSION);
    if (next) role.permissions.push(SERVICE_SOURCE_PERMISSION);
    if (before !== next) {
      addAudit(state, {
        actorEmail: actor.email,
        actorName: actor.name,
        action: "service.access.role",
        targetName: role.name,
        details: `${next ? "Granted" : "Removed"} Service Settings source access for role ${role.name}.`,
      });
    }
  } else {
    const user = state.users.find((item) => item.id === id);
    if (!user) return jsonError("Staff account not found.", 404);
    if (isMasterAdminAccount(user)) return jsonError("Master Admin access is permanent.", 409);
    const before = hasPermission(state, user, SERVICE_SOURCE_PERMISSION);
    if (access === "inherit") delete user.overrides[SERVICE_SOURCE_PERMISSION];
    else user.overrides[SERVICE_SOURCE_PERMISSION] = access === "on";
    const after = hasPermission(state, user, SERVICE_SOURCE_PERMISSION);
    addAudit(state, {
      actorEmail: actor.email,
      actorName: actor.name,
      action: "service.access.user",
      targetUserId: user.id,
      targetName: user.name,
      details: access === "inherit"
        ? `Reset ${user.name}'s Service Settings access to the ${getRole(state, user.roleId)?.name ?? user.roleId} role default.`
        : `${after ? "Granted" : "Removed"} individual Service Settings source access for ${user.name}${before === after ? " (effective access unchanged by role settings)" : ""}.`,
    });
  }

  await saveStaffState(state);
  return NextResponse.json(publicAccessState(state));
}
