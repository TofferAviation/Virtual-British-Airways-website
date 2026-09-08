import { NextRequest, NextResponse } from "next/server";
import {
  PREVIEW_ACCESS_COOKIE,
  getPreviewAccessToken,
  previewProtectionEnabled,
} from "./src/lib/preview-access";
import { isDirectLocalRequest, relativeRedirect } from "./src/lib/request-context";

const ACCESS_PAGE = "/preview-access";
const ACCESS_API = "/api/preview-access";

function isPublicPreviewPath(pathname: string) {
  if (pathname === ACCESS_PAGE || pathname.startsWith(`${ACCESS_PAGE}/`)) return true;
  if (pathname === ACCESS_API || pathname.startsWith(`${ACCESS_API}/`)) return true;

  // Public/static files still need to load on the access screen.
  return /\.[a-zA-Z0-9]+$/.test(pathname);
}

export async function proxy(request: NextRequest) {
  if (!previewProtectionEnabled()) return NextResponse.next();

  // Only direct local browsing bypasses the preview gate. Requests that arrive
  // through Cloudflare are still treated as external even though the origin is
  // localhost:3000 behind the tunnel.
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

  // Keep the redirect origin-relative so a Cloudflare request can never leak
  // the internal localhost origin back to the browser.
  return relativeRedirect(`${ACCESS_PAGE}?${params.toString()}`, 307);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
