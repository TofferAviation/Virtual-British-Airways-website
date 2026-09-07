import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const STAFF_COOKIE_NAME = "bav_staff_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

type StaffRole = "admin";

export type StaffSession = {
  email: string;
  name: string;
  role: StaffRole;
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

export function validateStaffCredentials(email: string, password: string) {
  const configuredEmail = process.env.BAV_STAFF_EMAIL ?? "";
  const configuredPassword = process.env.BAV_STAFF_PASSWORD ?? "";

  if (!isStaffAuthConfigured()) return false;

  return safeEqual(email.trim().toLowerCase(), configuredEmail.trim().toLowerCase()) && safeEqual(password, configuredPassword);
}

export function createStaffSessionToken(email: string): string {
  const session: StaffSession = {
    email: email.trim().toLowerCase(),
    name: process.env.BAV_STAFF_DISPLAY_NAME?.trim() || "Administrator",
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payload = encode(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

export function verifyStaffSessionToken(token?: string | null): StaffSession | null {
  if (!token || !isStaffAuthConfigured()) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  try {
    if (!safeEqual(signature, sign(payload))) return null;
    const session = JSON.parse(decode(payload)) as StaffSession;
    if (session.role !== "admin" || !session.email || !session.exp) return null;
    if (session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getStaffSession() {
  const cookieStore = await cookies();
  return verifyStaffSessionToken(cookieStore.get(STAFF_COOKIE_NAME)?.value);
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
