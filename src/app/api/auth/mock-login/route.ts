import { NextRequest, NextResponse } from "next/server";

function accountRedirectUrl(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/account";
  url.search = "";

  const hostname = url.hostname.toLowerCase();
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  if (isLocalhost) url.protocol = "http:";

  return url;
}

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(accountRedirectUrl(request));
  response.cookies.set("bav_demo_session", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
