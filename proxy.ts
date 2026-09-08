import { NextRequest, NextResponse } from "next/server";
import {
  PREVIEW_ACCESS_COOKIE,
  getPreviewAccessToken,
  previewProtectionEnabled,
} from "./src/lib/preview-access";

const ACCESS_PAGE = "/preview-access";
const ACCESS_API = "/api/preview-access";

function isLocalDevelopmentHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

function isPublicPreviewPath(pathname: string) {
  if (pathname === ACCESS_PAGE || pathname.startsWith(`${ACCESS_PAGE}/`)) return true;
  if (pathname === ACCESS_API || pathname.startsWith(`${ACCESS_API}/`)) return true;

  // Public/static files still need to load on the access screen.
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

export async function proxy(request: NextRequest) {
  if (!previewProtectionEnabled()) return NextResponse.next();

  // The preview password exists to protect externally shared development URLs.
  // Keep localhost completely outside the preview gate so pilot/staff auth and
  // normal local development continue to behave exactly as they did before.
  if (isLocalDevelopmentHost(request.nextUrl.hostname)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isPublicPreviewPath(pathname)) return NextResponse.next();

  const expectedToken = await getPreviewAccessToken();
  const currentToken = request.cookies.get(PREVIEW_ACCESS_COOKIE)?.value ?? "";

  if (expectedToken && currentToken === expectedToken) {
    return NextResponse.next();
  }

  const destination = request.nextUrl.clone();
  destination.pathname = ACCESS_PAGE;
  destination.search = "";
  destination.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
