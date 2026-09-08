import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { SERVICE_SOURCE_PERMISSION, type StaffRoleId } from "@/lib/permissions";
import { getStaffSession } from "@/lib/staff-auth";
import {
  addAudit,
  getRole,
  getStaffState,
  hasPermission,
  hashPassword,
  saveStaffState,
  type StaffAccount,
} from "@/lib/staff-store";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function publicUser(user: StaffAccount) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  void _passwordHash;
  return safeUser;
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession();
  if (!session) return jsonError("Staff authentication required.", 401);

  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!actor) return jsonError("Staff authentication required.", 401);
  if (!hasPermission(state, actor, "users.roles")) {
    return jsonError("You do not have permission to create staff accounts.", 403);
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    password?: string;
    roleId?: StaffRoleId;
    status?: "active" | "inactive";
  } | null;

  const name = body?.name?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  const roleId = body?.roleId ?? "support";
  const status = body?.status === "inactive" ? "inactive" : "active";

  if (!name) return jsonError("Staff name is required.");
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return jsonError("Enter a valid staff email address.");
  if (password.length < 8) return jsonError("Temporary password must be at least 8 characters long.");

  const role = getRole(state, roleId);
  if (!role) return jsonError("Selected role does not exist.");

  const configuredAdminEmail = process.env.BAV_STAFF_EMAIL?.trim().toLowerCase();
  if (configuredAdminEmail && email === configuredAdminEmail) {
    return jsonError("That email belongs to the permanent environment administrator.", 409);
  }

  const existing = state.users.find((user) => user.email.trim().toLowerCase() === email);
  if (existing?.isEnvironmentAdmin) {
    return jsonError("The environment administrator cannot be replaced here.", 409);
  }
  if (existing?.status === "active") {
    return jsonError("A staff account with that email already exists.", 409);
  }

  const sourceOverride = role.permissions.includes(SERVICE_SOURCE_PERMISSION)
    ? { [SERVICE_SOURCE_PERMISSION]: false }
    : {};

  let user: StaffAccount;
  if (existing) {
    existing.name = name;
    existing.roleId = roleId;
    existing.status = status;
    existing.passwordHash = hashPassword(password);
    existing.overrides = sourceOverride;
    user = existing;
  } else {
    user = {
      id: `staff-${randomUUID()}`,
      name,
      email,
      roleId,
      status,
      overrides: sourceOverride,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    state.users.push(user);
  }

  for (const invitation of state.invitations) {
    if (invitation.email.toLowerCase() === email && invitation.status === "pending") {
      invitation.status = "revoked";
    }
  }

  addAudit(state, {
    actorEmail: actor.email,
    actorName: actor.name,
    action: existing ? "staff.account.reactivated" : "staff.account.created",
    targetUserId: user.id,
    targetName: user.name,
    details: `${existing ? "Reactivated" : "Created"} staff account ${user.email} with role ${role.name} and status ${status}. Protected Service Settings access was not granted.`,
  });

  await saveStaffState(state);
  return NextResponse.json({ user: publicUser(user) }, { status: existing ? 200 : 201 });
}
