import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { PermissionId, StaffRoleId } from "@/lib/permissions";
import {
  findStaffUserByEmail,
  getStaffState,
  hasPermission,
  isMasterAdminAccount,
  markStaffActive,
  verifyPassword,
  type StaffAccount,
} from "@/lib/staff-store";

export const STAFF_COOKIE_NAME = "bav_staff_session_v1";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

export type StaffSession = {
  userId: string;
  email: string;
  name: string;
  roleId: StaffRoleId;
  isMasterAdmin: boolean;
  exp: number;
};

function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

function sessionSecret() {
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
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sessionFor(account: StaffAccount): StaffSession {
  return {
    userId: account.id,
    email: normaliseEmail(account.email),
    name: account.name,
    roleId: account.roleId,
    isMasterAdmin: isMasterAdminAccount(account),
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
}

export function isStaffAuthConfigured() {
  const secret = process.env.BAV_STAFF_SESSION_SECRET;
  return Boolean(secret && secret.length >= 24);
}

export async function validateStaffCredentials(email: string, password: string): Promise<StaffAccount | null> {
  const account = await findStaffUserByEmail(email);
  if (!account || account.status !== "active" || !verifyPassword(password, account.passwordHash)) return null;
  await markStaffActive(account.id);
  return account;
}

export function createStaffSessionToken(account: StaffAccount) {
  const payload = encode(JSON.stringify(sessionFor(account)));
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token?: string | null): StaffSession | null {
  if (!token || !isStaffAuthConfigured()) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  try {
    if (!safeEqual(signature, sign(payload))) return null;
    const session = JSON.parse(decode(payload)) as StaffSession;
    if (!session.userId || !session.email || !session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

/** Resolve a Staff Centre session only from the separate Staff Centre cookie. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(STAFF_COOKIE_NAME)?.value;
  const raw = verifyToken(token);

  // Temporary production diagnostics for Staff Centre tile authentication.
  // Do not log cookie contents, emails, passwords, keys, or staff IDs.
  console.info("[staff-session-diag]", {
    cookiePresent: Boolean(token),
    cookieLength: token?.length ?? 0,
    tokenValid: Boolean(raw),
  });
  if (!raw) return null;

  const state = await getStaffState();
  const account = state.users.find((user) => user.id === raw.userId && user.status === "active");
  console.info("[staff-session-diag]", {
    staffFound: Boolean(account),
    emailMatches: Boolean(account && normaliseEmail(account.email) === normaliseEmail(raw.email)),
  });
  if (!account || normaliseEmail(account.email) !== normaliseEmail(raw.email)) return null;
  return {
    ...raw,
    email: normaliseEmail(account.email),
    name: account.name,
    roleId: account.roleId,
    isMasterAdmin: isMasterAdminAccount(account),
  } satisfies StaffSession;
}

export async function staffHasPermission(permission: PermissionId) {
  const session = await getStaffSession();
  if (!session) return false;
  const state = await getStaffState();
  const account = state.users.find((user) => user.id === session.userId);
  return Boolean(account && hasPermission(state, account, permission));
}

export async function requireStaffSession() {
  const session = await getStaffSession();
  if (!session) redirect("/staff-login");
  return session;
}

export const staffSessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};

export async function requireStaffPermission(permission: PermissionId) {
  const session = await requireStaffSession();
  const state = await getStaffState();
  const account = state.users.find((user) => user.id === session.userId);
  if (!account || !hasPermission(state, account, permission)) redirect("/staff?denied=permissions");
  return session;
}
