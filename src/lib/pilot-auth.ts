import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { getPilotById, type PilotAccount } from "@/lib/pilot-store";
import { pilotSessionCookieDomain, requestUsesHttps } from "@/lib/request-context";

// v5 replaces earlier releases. Cookies issued before the custom-domain scope
// was stable can coexist as host-only and domain-scoped copies, causing the
// browser to send an unpredictable stale value after navigation.
export const PILOT_COOKIE_NAME = "bav_pilot_session_v5";
const LEGACY_PILOT_COOKIE_NAMES = [
  "bav_pilot_session_v4",
  "bav_pilot_session_v3",
  "bav_pilot_session_v2",
  "bav_pilot_session",
  "bav_demo_session",
];
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export type PilotSession = {
  pilotId: string;
  pilotNumber: string;
  email: string;
  name: string;
  authVersion?: number;
  exp: number;
};

function sessionSecret() {
  const secret = process.env.BAV_PILOT_SESSION_SECRET || process.env.BAV_STAFF_SESSION_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error("BAV_PILOT_SESSION_SECRET must be configured and at least 24 characters long.");
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

export function isPilotAuthConfigured() {
  const secret = process.env.BAV_PILOT_SESSION_SECRET || process.env.BAV_STAFF_SESSION_SECRET;
  return Boolean(secret && secret.length >= 24);
}

export function createPilotSessionToken(account: PilotAccount) {
  const session: PilotSession = {
    pilotId: account.id,
    pilotNumber: account.pilotNumber,
    email: account.email,
    name: account.name,
    authVersion: account.authVersion,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payload = encode(JSON.stringify(session));
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

/** Issue one domain-wide pilot session and remove all older cookie variants. */
export function issuePilotSession(response: NextResponse, request: NextRequest, account: PilotAccount) {
  const domain = pilotSessionCookieDomain(request);
  response.cookies.set(PILOT_COOKIE_NAME, createPilotSessionToken(account), {
    ...pilotSessionCookieOptions,
    secure: requestUsesHttps(request),
    domain,
  });
  for (const name of LEGACY_PILOT_COOKIE_NAMES) {
    expireCookie(response, name, request, domain);
    if (domain) expireCookie(response, name, request);
  }
}

/** End a pilot session from either host-only or shared-domain cookie scope. */
export function clearPilotSession(response: NextResponse, request: NextRequest) {
  const domain = pilotSessionCookieDomain(request);
  for (const name of [PILOT_COOKIE_NAME, ...LEGACY_PILOT_COOKIE_NAMES]) {
    expireCookie(response, name, request, domain);
    if (domain) expireCookie(response, name, request);
  }
}

function verifyToken(token?: string | null): PilotSession | null {
  if (!token || !isPilotAuthConfigured()) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  try {
    if (!safeEqual(signature, sign(payload))) return null;
    const session = JSON.parse(decode(payload)) as PilotSession;
    if (!session.pilotId || !session.pilotNumber || !session.email || !session.exp) return null;
    if (session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getPilotSession() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PILOT_COOKIE_NAME)?.value;
  const session = verifyToken(raw);

  // Temporary production diagnostics for the session-recovery investigation.
  // Deliberately do not log cookie contents, emails, passwords, keys, or pilot IDs.
  console.info("[pilot-session-diag]", {
    cookiePresent: Boolean(raw),
    cookieLength: raw?.length ?? 0,
    tokenValid: Boolean(session),
  });
  if (!session) return null;

  const account = await getPilotById(session.pilotId);
  console.info("[pilot-session-diag]", {
    pilotFound: Boolean(account),
    pilotActive: account?.status === "active",
  });
  if (!account || account.status !== "active" || (session.authVersion ?? 1) !== account.authVersion) return null;
  return {
    ...session,
    pilotNumber: account.pilotNumber,
    email: account.email,
    name: account.name,
  } satisfies PilotSession;
}

export async function requirePilotSession() {
  const session = await getPilotSession();
  if (!session) redirect("/login");
  return session;
}

export const pilotSessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
