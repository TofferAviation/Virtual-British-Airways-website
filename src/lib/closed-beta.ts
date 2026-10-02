import type { NextRequest, NextResponse } from "next/server";
import { pilotSessionCookieDomain, requestUsesHttps } from "@/lib/request-context";

export const CLOSED_BETA_COOKIE_NAME = "bav_closed_beta_access_v1";
const TOKEN_VERSION = "bav-closed-beta-v1";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;

type ClosedBetaToken = {
  pilotId: string;
  authVersion: number;
  exp: number;
};

function secret() {
  return (process.env.BAV_PILOT_SESSION_SECRET ?? process.env.BAV_STAFF_SESSION_SECRET ?? "").trim();
}

function encode(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

async function signature(payload: string) {
  const signingKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${TOKEN_VERSION}:${secret()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", signingKey, new TextEncoder().encode(payload)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function closedBetaEnabled() {
  return ["true", "1", "enabled"].includes((process.env.BAV_CLOSED_BETA_ENABLED ?? "").trim().toLowerCase());
}

export async function createClosedBetaToken(input: { pilotId: string; authVersion: number }) {
  const payload = encode(JSON.stringify({
    pilotId: input.pilotId,
    authVersion: input.authVersion,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  } satisfies ClosedBetaToken));
  return `${payload}.${await signature(payload)}`;
}

export async function hasClosedBetaAccess(token?: string | null) {
  if (!token || !closedBetaEnabled() || secret().length < 24) return false;
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature || suppliedSignature !== await signature(payload)) return false;
  try {
    const value = JSON.parse(decode(payload)) as ClosedBetaToken;
    return Boolean(value.pilotId) && Number.isInteger(value.authVersion) && value.authVersion > 0 && value.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function issueClosedBetaAccess(response: NextResponse, request: NextRequest, input: { pilotId: string; authVersion: number }) {
  if (!closedBetaEnabled()) return;
  response.cookies.set(CLOSED_BETA_COOKIE_NAME, await createClosedBetaToken(input), {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUsesHttps(request),
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
    domain: pilotSessionCookieDomain(request),
  });
}

export function clearClosedBetaAccess(response: NextResponse, request: NextRequest) {
  const domain = pilotSessionCookieDomain(request);
  response.cookies.set(CLOSED_BETA_COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: requestUsesHttps(request), path: "/", maxAge: 0, domain });
  if (domain) response.cookies.set(CLOSED_BETA_COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: requestUsesHttps(request), path: "/", maxAge: 0 });
}
