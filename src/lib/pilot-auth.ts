import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPilotById, type PilotAccount } from "@/lib/pilot-store";

export const PILOT_COOKIE_NAME = "bav_pilot_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export type PilotSession = {
  pilotId: string;
  pilotNumber: string;
  email: string;
  name: string;
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
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payload = encode(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
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
  const session = verifyToken(cookieStore.get(PILOT_COOKIE_NAME)?.value);
  if (!session) return null;
  const account = await getPilotById(session.pilotId);
  if (!account || account.status !== "active") return null;
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
