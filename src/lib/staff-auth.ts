import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { PermissionId, StaffRoleId } from "@/lib/permissions";
import {
  findStaffUserByEmail,
  getStaffState,
  hasPermission,
  markStaffActive,
  verifyPassword,
  type StaffAccount,
} from "@/lib/staff-store";

export const STAFF_COOKIE_NAME = "bav_staff_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

export type StaffSession = {
  userId: string;
  email: string;
  name: string;
  roleId: StaffRoleId;
  isMasterAdmin: boolean;
  exp: number;
};

export type StaffSessionFailure = "missing-cookie" | "invalid-session" | "account-unavailable" | "not-configured";

type StaffSessionResolution =
  | { session: StaffSession; failure: null }
  | { session: null; failure: StaffSessionFailure };

function requireSessionSecret() {
  const secret = process.env.BAV_STAFF_SESSION_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("BAV_STAFF_SESSION_SECRET must be configured and at least 24 characters long.");
  }
  return secret;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string) {
  return createHmac("sha256", requireSessionSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isStaffAuthConfigured() {
  return Boolean(
    process.env.BAV_STAFF_EMAIL &&
      process.env.BAV_STAFF_PASSWORD &&
      process.env.BAV_STAFF_SESSION_SECRET &&
      process.env.BAV_STAFF_SESSION_SECRET.length >= 24,
  );
}

export async function validateStaffCredentials(email: string, password: string): Promise<StaffAccount | null> {
  if (!isStaffAuthConfigured()) return null;
  const normalizedEmail = email.trim().toLowerCase();
  const configuredEmail = process.env.BAV_STAFF_EMAIL?.trim().toLowerCase() ?? "";
  const configuredPassword = process.env.BAV_STAFF_PASSWORD ?? "";
  const isConfiguredOwner = safeEqual(normalizedEmail, configuredEmail) && safeEqual(password, configuredPassword);

  const account = await findStaffUserByEmail(normalizedEmail);
  // The configured owner is the break-glass account for the service. Its
  // access must not depend on a mutable staff_state record being present or
  // correctly normalised after deployment; the matching environment email and
  // password remain mandatory.
  if (!account) {
    if (!isConfiguredOwner) return null;
    return {
      id: "env-admin",
      name: process.env.BAV_STAFF_DISPLAY_NAME?.trim() || "Administrator",
      email: configuredEmail,
      roleId: "admin",
      status: "active",
      overrides: {},
      isEnvironmentAdmin: true,
      createdAt: new Date().toISOString(),
    };
  }
  if (account.status !== "active") return null;

  if (account.isEnvironmentAdmin || normalizedEmail === configuredEmail) {
    if (!safeEqual(normalizedEmail, configuredEmail)) return null;
    // The configured owner password remains a server-side recovery credential
    // for the master-admin email. Invited staff accounts can only use their
    // own stored password hash.
    const passwordMatches =
      (account.passwordHash && verifyPassword(password, account.passwordHash)) ||
      isConfiguredOwner;
    if (!passwordMatches) return null;
  } else if (!verifyPassword(password, account.passwordHash)) {
    return null;
  }

  await markStaffActive(account.id);
  return account;
}

export function createStaffSessionToken(account: StaffAccount): string {
  const session: StaffSession = {
    userId: account.id,
    email: account.email.trim().toLowerCase(),
    name: account.name,
    roleId: account.roleId,
    isMasterAdmin: Boolean(account.isEnvironmentAdmin),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payload = encode(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

function verifySignedSessionToken(token?: string | null): StaffSession | null {
  if (!token || !isStaffAuthConfigured()) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  try {
    if (!safeEqual(signature, sign(payload))) return null;
    const session = JSON.parse(decode(payload)) as StaffSession;
    if (!session.userId || !session.email || !session.exp) return null;
    if (session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

async function resolveStaffSession(): Promise<StaffSessionResolution> {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_COOKIE_NAME)?.value;
  if (!token) return { session: null, failure: "missing-cookie" };
  if (!isStaffAuthConfigured()) return { session: null, failure: "not-configured" };

  const rawSession = verifySignedSessionToken(token);
  if (!rawSession) return { session: null, failure: "invalid-session" };

  const state = await getStaffState();
  const sessionEmail = rawSession.email.trim().toLowerCase();
  // An invited account can be re-created or normalised after a deployment.
  // Match the immutable email as well as the historical id, but only for an
  // active account in the current authoritative staff state.
  const account = state.users.find((user) =>
    user.status === "active" &&
    (user.id === rawSession.userId || user.email.trim().toLowerCase() === sessionEmail),
  );
  if (!account) return { session: null, failure: "account-unavailable" };

  return { session: {
    ...rawSession,
    // Always issue the current authoritative id to downstream permission
    // checks. A signed session may contain an older id after an account has
    // been re-created, but the validated active account above is the one
    // whose permissions must be applied.
    userId: account.id,
    email: account.email,
    name: account.name,
    roleId: account.roleId,
    isMasterAdmin: Boolean(account.isEnvironmentAdmin),
  } satisfies StaffSession, failure: null };
}

export async function getStaffSession() {
  return (await resolveStaffSession()).session;
}

export async function staffHasPermission(permission: PermissionId) {
  const session = await getStaffSession();
  if (!session) return false;
  const state = await getStaffState();
  const user = state.users.find((item) => item.id === session.userId);
  return Boolean(user && hasPermission(state, user, permission));
}

export async function requireStaffPermission(permission: PermissionId) {
  const session = await requireStaffSession();
  const state = await getStaffState();
  const user = state.users.find((item) => item.id === session.userId);
  if (!user || !hasPermission(state, user, permission)) redirect("/staff?denied=permissions");
  return session;
}

export async function requireStaffSession() {
  const result = await resolveStaffSession();
  if (!result.session) redirect(`/staff-login?reason=${result.failure}`);
  return result.session;
}

export const staffSessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
