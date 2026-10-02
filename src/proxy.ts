import { NextRequest, NextResponse } from "next/server";
import {
  PREVIEW_ACCESS_COOKIE,
  getPreviewAccessToken,
  previewProtectionEnabled,
} from "./lib/preview-access";
import { CLOSED_BETA_COOKIE_NAME, closedBetaEnabled, hasClosedBetaAccess } from "./lib/closed-beta";
import { isDirectLocalRequest, relativeRedirect } from "./lib/request-context";

const ACCESS_PAGE = "/preview-access";
const ACCESS_API = "/api/preview-access";
const CLOSED_BETA_PAGE = "/closed-beta";

function isPublicPreviewPath(pathname: string) {
  if (pathname === ACCESS_PAGE || pathname.startsWith(`${ACCESS_PAGE}/`)) return true;
  if (pathname === ACCESS_API || pathname.startsWith(`${ACCESS_API}/`)) return true;

  // Public/static files still need to load on the access screen.
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

function isPublicClosedBetaPath(pathname: string) {
  if (pathname === CLOSED_BETA_PAGE || pathname.startsWith(`${CLOSED_BETA_PAGE}/`)) return true;
  if (pathname === "/login" || pathname === "/forgot-password" || pathname === "/reset-password") return true;
  if (pathname === "/staff-login" || pathname.startsWith("/staff") || pathname.startsWith("/staff-invite")) return true;
  if (pathname.startsWith("/api/")) return true;
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

export async function proxy(request: NextRequest) {
  // Closed beta must never rely on a forwarded host to decide access. Hosting
  // proxies and local relays can legitimately rewrite that header; the feature
  // flag itself is the explicit control. Local development remains open unless
  // a developer deliberately enables the flag.
  if (closedBetaEnabled()) {
    const { pathname } = request.nextUrl;
    if (!isPublicClosedBetaPath(pathname) && !await hasClosedBetaAccess(request.cookies.get(CLOSED_BETA_COOKIE_NAME)?.value)) {
      const params = new URLSearchParams({ next: `${request.nextUrl.pathname}${request.nextUrl.search}` });
      return relativeRedirect(`${CLOSED_BETA_PAGE}?${params.toString()}`, 307);
    }
  }

  if (!previewProtectionEnabled()) return NextResponse.next();

  // Only direct local browsing bypasses the preview gate.
  if (isDirectLocalRequest(request)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isPublicPreviewPath(pathname)) return NextResponse.next();

  const expectedToken = await getPreviewAccessToken();
  const currentToken = request.cookies.get(PREVIEW_ACCESS_COOKIE)?.value ?? "";

  if (expectedToken && currentToken === expectedToken) {
    return NextResponse.next();
  }

  const params = new URLSearchParams({
    next: `${request.nextUrl.pathname}${request.nextUrl.search}`,
  });

  // Keep redirects origin-relative so internal development addresses are never
  // exposed to the browser.
  return relativeRedirect(`${ACCESS_PAGE}?${params.toString()}`, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
