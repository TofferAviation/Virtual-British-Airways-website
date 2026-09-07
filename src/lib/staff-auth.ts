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
  exp: number;
};

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

  const account = await findStaffUserByEmail(normalizedEmail);
  if (!account || account.status !== "active") return null;

  if (account.isEnvironmentAdmin || normalizedEmail === configuredEmail) {
    if (!safeEqual(normalizedEmail, configuredEmail) || !safeEqual(password, configuredPassword)) return null;
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

export async function getStaffSession() {
  const cookieStore = await cookies();
  const rawSession = verifySignedSessionToken(cookieStore.get(STAFF_COOKIE_NAME)?.value);
  if (!rawSession) return null;

  const state = await getStaffState();
  const account = state.users.find((user) => user.id === rawSession.userId && user.status === "active");
  if (!account) return null;

  return {
    ...rawSession,
    email: account.email,
    name: account.name,
    roleId: account.roleId,
  } satisfies StaffSession;
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
