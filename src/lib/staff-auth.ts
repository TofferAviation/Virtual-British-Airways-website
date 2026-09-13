import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
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
import { pilotSessionCookieDomain, requestUsesHttps } from "@/lib/request-context";

// v2 deliberately replaces v1. Earlier production versions could issue v1
// as host-only and later as domain-scoped, leaving two same-named cookies for
// the browser to send in an unpredictable order on Staff Centre tile routes.
export const STAFF_COOKIE_NAME = "bav_staff_session_v2";
const LEGACY_STAFF_COOKIE_NAMES = ["bav_staff_session_v1"];
const SESSION_TTL_SECONDS = 60 * 60 * 8;

export type StaffSession = {
  userId: string;
  email: string;
  name: string;
  profileImage?: string | null;
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
    profileImage: account.profileImage ?? null,
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
  const passwordAccepted = Boolean(account && verifyPassword(password, account.passwordHash));
  console.info("[staff-login-diag]", {
    accountFound: Boolean(account),
    accountActive: account?.status === "active",
    passwordConfigured: Boolean(account?.passwordHash),
    passwordAccepted,
  });
  if (!account || account.status !== "active" || !passwordAccepted) return null;
  await markStaffActive(account.id);
  return account;
}

export function createStaffSessionToken(account: StaffAccount) {
  const payload = encode(JSON.stringify(sessionFor(account)));
  return `${payload}.${sign(payload)}`;
}

function expireCookie(response: NextResponse, name: string, request: NextRequest, domain?: string) {
  response.cookies.set(name, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUsesHttps(request),
    path: "/",
    maxAge: 0,
    domain,
  });
}

/** Issue one unambiguous Staff Centre session and retire all older variants. */
export function issueStaffSession(response: NextResponse, request: NextRequest, account: StaffAccount) {
  const domain = pilotSessionCookieDomain(request);
  response.cookies.set(STAFF_COOKIE_NAME, createStaffSessionToken(account), {
    ...staffSessionCookieOptions,
    secure: requestUsesHttps(request),
    domain,
  });
  for (const name of LEGACY_STAFF_COOKIE_NAMES) {
    expireCookie(response, name, request, domain);
    if (domain) expireCookie(response, name, request);
  }
}

/** End the current session and remove legacy cookie variants. */
export function clearStaffSession(response: NextResponse, request: NextRequest) {
  const domain = pilotSessionCookieDomain(request);
  for (const name of [STAFF_COOKIE_NAME, ...LEGACY_STAFF_COOKIE_NAMES]) {
    expireCookie(response, name, request, domain);
    if (domain) expireCookie(response, name, request);
  }
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
