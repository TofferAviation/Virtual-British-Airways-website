import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  defaultRoleTemplates,
  effectivePermissions,
  masterPermissions,
  type PermissionId,
  type StaffRoleId,
  type StaffRoleTemplate,
} from "@/lib/permissions";

export type StaffAccountStatus = "active" | "invited" | "inactive";

export type StaffAccount = {
  id: string;
  pilotId?: string;
  name: string;
  email: string;
  roleId: StaffRoleId;
  status: StaffAccountStatus;
  overrides: Partial<Record<PermissionId, boolean>>;
  passwordHash?: string;
  isEnvironmentAdmin?: boolean;
  createdAt: string;
  lastActiveAt?: string;
};

export type StaffInvitation = {
  id: string;
  email: string;
  name: string;
  roleId: StaffRoleId;
  message?: string;
  tokenHash: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
  expiresAt: string;
  invitedBy: string;
};

export type StaffAuditEntry = {
  id: string;
  at: string;
  actorEmail: string;
  actorName: string;
  action: string;
  targetUserId?: string;
  targetName?: string;
  details: string;
};

export type StaffState = {
  users: StaffAccount[];
  roles: StaffRoleTemplate[];
  invitations: StaffInvitation[];
  audit: StaffAuditEntry[];
};

const dataDir = path.join(process.cwd(), ".bav-data");
const staffFile = path.join(dataDir, "staff.json");

function getStaffStateClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function envAdmin(): StaffAccount | null {
  const email = process.env.BAV_STAFF_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  return {
    id: "env-admin",
    name: process.env.BAV_STAFF_DISPLAY_NAME?.trim() || "Administrator",
    email,
    roleId: "admin",
    status: "active",
    overrides: {},
    isEnvironmentAdmin: true,
    createdAt: nowIso(),
  };
}

export function isMasterAdminAccount(user: StaffAccount) {
  const configuredEmail = process.env.BAV_STAFF_EMAIL?.trim().toLowerCase();
  return Boolean(
    user.isEnvironmentAdmin ||
      user.id === "env-admin" ||
      (configuredEmail && user.email.trim().toLowerCase() === configuredEmail),
  );
}

function normalizeState(input?: Partial<StaffState>): StaffState {
  const roles = Array.isArray(input?.roles) && input!.roles!.length ? input!.roles! : defaultRoleTemplates;
  const users = Array.isArray(input?.users) ? input!.users! : [];
  const invitations = Array.isArray(input?.invitations) ? input!.invitations! : [];
  const audit = Array.isArray(input?.audit) ? input!.audit! : [];

  const admin = envAdmin();
  if (admin) {
    const existing = users.find((user) => user.id === admin.id || user.email.toLowerCase() === admin.email);
    if (existing) {
      existing.id = "env-admin";
      existing.name = admin.name;
      existing.email = admin.email;
      existing.roleId = "admin";
      existing.status = "active";
      existing.overrides = {};
      existing.isEnvironmentAdmin = true;
    } else {
      users.unshift(admin);
    }
  }

  return { users, roles, invitations, audit: audit.slice(0, 300) };
}

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

export async function getStaffState(): Promise<StaffState> {
  const client = getStaffStateClient();
  if (client) {
    const { data, error } = await client.from("staff_state").select("state").eq("singleton", true).maybeSingle();
    if (error) throw error;
    if (data?.state) return normalizeState(data.state as StaffState);

    const initial = normalizeState();
    const { error: createError } = await client.from("staff_state").upsert({ singleton: true, state: initial });
    if (createError) throw createError;
    return initial;
  }
  try {
    const raw = await readFile(staffFile, "utf8");
    return normalizeState(JSON.parse(raw) as StaffState);
  } catch {
    return normalizeState();
  }
}

export async function saveStaffState(state: StaffState) {
  const normalized = normalizeState(state);
  const client = getStaffStateClient();
  if (client) {
    const { error } = await client.from("staff_state").upsert({ singleton: true, state: normalized });
    if (error) throw error;
    return;
  }
  await ensureDataDir();
  const tmp = `${staffFile}.tmp`;
  await writeFile(tmp, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await rename(tmp, staffFile);
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored?: string) {
  if (!stored) return false;
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  try {
    const actual = scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getRole(state: StaffState, roleId: StaffRoleId) {
  return state.roles.find((role) => role.id === roleId);
}

export function permissionsForUser(state: StaffState, user: StaffAccount) {
  if (isMasterAdminAccount(user)) return new Set<PermissionId>(masterPermissions);
  return effectivePermissions(getRole(state, user.roleId), user.overrides);
}

export function hasPermission(state: StaffState, user: StaffAccount, permission: PermissionId) {
  if (user.status !== "active") return false;
  if (isMasterAdminAccount(user)) return true;
  return permissionsForUser(state, user).has(permission);
}

export async function findStaffUserByEmail(email: string) {
  const state = await getStaffState();
  return state.users.find((user) => user.email.toLowerCase() === email.trim().toLowerCase()) ?? null;
}

export async function getStaffUserById(id: string) {
  const state = await getStaffState();
  return state.users.find((user) => user.id === id) ?? null;
}

export async function markStaffActive(id: string) {
  const state = await getStaffState();
  const user = state.users.find((item) => item.id === id);
  if (!user) return;
  user.lastActiveAt = nowIso();
  await saveStaffState(state);
}

export async function updateOwnStaffProfile(id: string, input: { name: string }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new Error("Display name must be between 2 and 80 characters.");
  const state = await getStaffState();
  const user = state.users.find((item) => item.id === id && item.status === "active");
  if (!user) throw new Error("Staff account not found.");
  user.name = name;
  addAudit(state, { actorEmail: user.email, actorName: name, action: "staff.profile.updated", targetUserId: user.id, targetName: name, details: "Updated their own staff display name." });
  await saveStaffState(state);
  return user;
}

export async function changeOwnStaffPassword(id: string, currentPassword: string, newPassword: string) {
  if (newPassword.length < 10) throw new Error("Use a password with at least 10 characters.");
  const state = await getStaffState();
  const user = state.users.find((item) => item.id === id && item.status === "active");
  if (!user) throw new Error("Staff account not found.");

  const configuredOwnerPassword = process.env.BAV_STAFF_PASSWORD ?? "";
  const currentPasswordMatches = user.passwordHash
    ? verifyPassword(currentPassword, user.passwordHash)
    : Boolean(user.isEnvironmentAdmin && configuredOwnerPassword && currentPassword.length === configuredOwnerPassword.length && timingSafeEqual(Buffer.from(currentPassword), Buffer.from(configuredOwnerPassword)));
  if (!currentPasswordMatches) throw new Error("Your current password is incorrect.");

  user.passwordHash = hashPassword(newPassword);
  addAudit(state, { actorEmail: user.email, actorName: user.name, action: "staff.password.updated", targetUserId: user.id, targetName: user.name, details: "Updated their own staff password." });
  await saveStaffState(state);
}

export function addAudit(
  state: StaffState,
  input: Omit<StaffAuditEntry, "id" | "at">,
) {
  state.audit.unshift({
    id: `audit-${Date.now()}-${randomBytes(3).toString("hex")}`,
    at: nowIso(),
    ...input,
  });
  state.audit = state.audit.slice(0, 300);
}

export async function createStaffInvitation(input: {
  email: string;
  name: string;
  roleId: StaffRoleId;
  message?: string;
  actorEmail: string;
  actorName: string;
}) {
  const state = await getStaffState();
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("Email is required.");
  if (!getRole(state, input.roleId)) throw new Error("Selected role does not exist.");
  if (state.users.some((user) => user.email.toLowerCase() === email && user.status === "active")) {
    throw new Error("That user already has active staff access.");
  }

  for (const invitation of state.invitations) {
    if (invitation.email === email && invitation.status === "pending") invitation.status = "revoked";
  }

  const token = randomBytes(32).toString("base64url");
  const invitation: StaffInvitation = {
    id: `invite-${Date.now()}-${randomBytes(3).toString("hex")}`,
    email,
    name: input.name.trim() || email.split("@")[0],
    roleId: input.roleId,
    message: input.message?.trim() || undefined,
    tokenHash: hashInvitationToken(token),
    status: "pending",
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    invitedBy: input.actorEmail,
  };
  state.invitations.unshift(invitation);

  const existing = state.users.find((user) => user.email.toLowerCase() === email);
  if (existing) {
    existing.name = invitation.name;
    existing.roleId = invitation.roleId;
    existing.status = "invited";
    existing.overrides = {};
  } else {
    state.users.push({
      id: `staff-${Date.now()}-${randomBytes(3).toString("hex")}`,
      name: invitation.name,
      email,
      roleId: invitation.roleId,
      status: "invited",
      overrides: {},
      createdAt: nowIso(),
    });
  }

  addAudit(state, {
    actorEmail: input.actorEmail,
    actorName: input.actorName,
    action: "staff.invited",
    targetName: invitation.name,
    details: `Invited ${invitation.email} as ${getRole(state, invitation.roleId)?.name ?? invitation.roleId}.`,
  });
  await saveStaffState(state);
  return { invitation, token };
}

export async function acceptStaffInvitation(token: string, password: string) {
  if (password.length < 10) throw new Error("Use a password with at least 10 characters.");
  const state = await getStaffState();
  const tokenHash = hashInvitationToken(token);
  const invitation = state.invitations.find((item) => item.tokenHash === tokenHash && item.status === "pending");
  if (!invitation) throw new Error("This invitation is invalid or has already been used.");
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
    invitation.status = "expired";
    await saveStaffState(state);
    throw new Error("This invitation has expired.");
  }

  let user = state.users.find((item) => item.email.toLowerCase() === invitation.email.toLowerCase());
  if (!user) {
    user = {
      id: `staff-${Date.now()}-${randomBytes(3).toString("hex")}`,
      name: invitation.name,
      email: invitation.email,
      roleId: invitation.roleId,
      status: "active",
      overrides: {},
      createdAt: nowIso(),
    };
    state.users.push(user);
  }
  user.name = invitation.name;
  user.roleId = invitation.roleId;
  user.status = "active";
  user.passwordHash = hashPassword(password);
  user.overrides = {};
  invitation.status = "accepted";

  addAudit(state, {
    actorEmail: user.email,
    actorName: user.name,
    action: "staff.invitation.accepted",
    targetUserId: user.id,
    targetName: user.name,
    details: `${user.name} accepted staff access as ${getRole(state, user.roleId)?.name ?? user.roleId}.`,
  });
  await saveStaffState(state);
  return user;
}
