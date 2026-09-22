import { NextRequest, NextResponse } from "next/server";
import {
  PREVIEW_ACCESS_COOKIE,
  getPreviewAccessToken,
  previewProtectionEnabled,
} from "./src/lib/preview-access";
import { isDirectLocalRequest, relativeRedirect } from "./src/lib/request-context";

const ACCESS_PAGE = "/preview-access";
const ACCESS_API = "/api/preview-access";
const COMING_SOON_PAGE = "/coming-soon";

// Keep the public web site in launch mode until BAV is ready to open new
// registrations. Existing pilot and staff cookies remain fully functional.
// This is deliberately source-controlled instead of depending on a hosting
// setting: a stale environment value must never accidentally open the site.
const PUBLIC_LAUNCH_MODE = true;
const PILOT_SESSION_COOKIE = "bav_pilot_session_v5";
const STAFF_SESSION_COOKIE = "bav_staff_session_v2";

function isPublicPreviewPath(pathname: string) {
  if (pathname === ACCESS_PAGE || pathname.startsWith(`${ACCESS_PAGE}/`)) return true;
  if (pathname === ACCESS_API || pathname.startsWith(`${ACCESS_API}/`)) return true;

  // Public/static files still need to load on the access screen.
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

function publicLaunchModeEnabled() {
  return PUBLIC_LAUNCH_MODE;
}

function isLaunchAccessPath(pathname: string) {
  return isPublicPreviewPath(pathname) ||
    pathname === COMING_SOON_PAGE ||
    pathname.startsWith(`${COMING_SOON_PAGE}/`) ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/forgot-password/") ||
    pathname === "/reset-password" ||
    pathname.startsWith("/reset-password/") ||
    pathname === "/staff-login" ||
    pathname.startsWith("/staff-login/") ||
    pathname === "/staff-invite" ||
    pathname.startsWith("/staff-invite/") ||
    // Ember and account recovery must continue to use their existing APIs.
    pathname.startsWith("/api/");
}

function decodeBase64Url(value: string) {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function hasValidSession(token: string | undefined, secret: string | undefined) {
  if (!token || !secret || secret.length < 24) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;

  try {
    const decodedPayload = decodeBase64Url(payload);
    const suppliedSignature = decodeBase64Url(signature);
    if (!decodedPayload || !suppliedSignature) return false;
    const session = JSON.parse(new TextDecoder().decode(decodedPayload)) as { exp?: unknown };
    if (typeof session.exp !== "number" || session.exp <= Math.floor(Date.now() / 1000)) return false;

    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expectedSignature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
    return equalBytes(expectedSignature, suppliedSignature);
  } catch {
    return false;
  }
}

async function hasBavSession(request: NextRequest) {
  const pilotSecret = process.env.BAV_PILOT_SESSION_SECRET || process.env.BAV_STAFF_SESSION_SECRET;
  if (await hasValidSession(request.cookies.get(PILOT_SESSION_COOKIE)?.value, pilotSecret)) return true;
  return hasValidSession(request.cookies.get(STAFF_SESSION_COOKIE)?.value, process.env.BAV_STAFF_SESSION_SECRET);
}

export async function proxy(request: NextRequest) {
  // Direct local browsing remains open for development and diagnostic work.
  if (isDirectLocalRequest(request)) return NextResponse.next();
  if (!previewProtectionEnabled()) return allowLaunchAccess(request);

  const { pathname } = request.nextUrl;
  if (isPublicPreviewPath(pathname)) return allowLaunchAccess(request);

  const expectedToken = await getPreviewAccessToken();
  const currentToken = request.cookies.get(PREVIEW_ACCESS_COOKIE)?.value ?? "";

  if (expectedToken && currentToken === expectedToken) {
    return allowLaunchAccess(request);
  }

  const params = new URLSearchParams({
    next: `${request.nextUrl.pathname}${request.nextUrl.search}`,
  });

  // Keep redirects origin-relative so internal development addresses are never
  // exposed to the browser.
  return relativeRedirect(`${ACCESS_PAGE}?${params.toString()}`, 307);
}

async function allowLaunchAccess(request: NextRequest) {
  if (!publicLaunchModeEnabled() || isLaunchAccessPath(request.nextUrl.pathname) || await hasBavSession(request)) {
    return NextResponse.next();
  }

  return relativeRedirect(COMING_SOON_PAGE, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
