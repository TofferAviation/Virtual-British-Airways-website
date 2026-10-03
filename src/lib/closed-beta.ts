import type { NextRequest, NextResponse } from "next/server";
import { pilotSessionCookieDomain, requestUsesHttps } from "@/lib/request-context";

// v2 replaces v1 because early closed-beta releases could leave both a
// host-only and a domain-wide v1 cookie in a browser. Depending on cookie
// ordering, the beta gate could then receive the stale value after sign-in.
export const CLOSED_BETA_COOKIE_NAME = "bav_closed_beta_access_v2";
// Kept in sync with pilot-auth. This separate, edge-safe verifier lets the
// beta request gate trust the same signed sign-in session when the optional
// beta convenience cookie is unavailable in a browser.
export const CLOSED_BETA_PILOT_SESSION_COOKIE_NAME = "bav_pilot_session_v7";
const LEGACY_CLOSED_BETA_COOKIE_NAMES = ["bav_closed_beta_access_v1"];
const TOKEN_VERSION = "bav-closed-beta-v1";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14;

type ClosedBetaToken = {
  pilotId: string;
  authVersion: number;
  exp: number;
};

function secret() {
  // Keep the beta gate independent from the two account-session systems.
  // Its issuer and request gate must always sign with the exact same key.
  return (
    process.env.BAV_CLOSED_BETA_GATE_SECRET ??
    process.env.BAV_PILOT_SESSION_SECRET ??
    process.env.BAV_STAFF_SESSION_SECRET ??
    ""
  ).trim();
}

function pilotSessionSecret() {
  return (process.env.BAV_PILOT_SESSION_SECRET ?? process.env.BAV_STAFF_SESSION_SECRET ?? "").trim();
}

function encode(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function base64UrlBytes(value: string) {
  const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
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

/**
 * Verify the pilot session using Web Crypto so this remains safe for the
 * edge request gate. betaAccess is embedded only after a successful invited
 * user or staff-authorised sign-in, and is covered by the session signature.
 */
export async function hasClosedBetaPilotSession(token?: string | null) {
  const signingSecret = pilotSessionSecret();
  if (!token || signingSecret.length < 24) return false;

  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlBytes(suppliedSignature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return false;

    const value = JSON.parse(decode(payload)) as { pilotId?: string; authVersion?: number; betaAccess?: boolean; exp?: number };
    return Boolean(value.pilotId)
      && Number.isInteger(value.authVersion)
      && (value.authVersion ?? 0) > 0
      && value.betaAccess === true
      && typeof value.exp === "number"
      && value.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function issueClosedBetaAccess(response: NextResponse, request: NextRequest, input: { pilotId: string; authVersion: number }) {
  if (!closedBetaEnabled()) return;
  const domain = pilotSessionCookieDomain(request);
  response.cookies.set(CLOSED_BETA_COOKIE_NAME, await createClosedBetaToken(input), {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUsesHttps(request),
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
    domain,
  });
  for (const name of LEGACY_CLOSED_BETA_COOKIE_NAMES) {
    response.cookies.set(name, "", { httpOnly: true, sameSite: "lax", secure: requestUsesHttps(request), path: "/", maxAge: 0, domain });
    if (domain) response.cookies.set(name, "", { httpOnly: true, sameSite: "lax", secure: requestUsesHttps(request), path: "/", maxAge: 0 });
  }
}

export function clearClosedBetaAccess(response: NextResponse, request: NextRequest) {
  const domain = pilotSessionCookieDomain(request);
  for (const name of [CLOSED_BETA_COOKIE_NAME, ...LEGACY_CLOSED_BETA_COOKIE_NAMES]) {
    response.cookies.set(name, "", { httpOnly: true, sameSite: "lax", secure: requestUsesHttps(request), path: "/", maxAge: 0, domain });
    if (domain) response.cookies.set(name, "", { httpOnly: true, sameSite: "lax", secure: requestUsesHttps(request), path: "/", maxAge: 0 });
  }
}
