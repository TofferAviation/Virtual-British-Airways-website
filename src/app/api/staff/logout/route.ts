import { NextRequest } from "next/server";
import { STAFF_COOKIE_NAME, staffSessionCookieDomain } from "@/lib/staff-auth";
import { relativeRedirect, requestUsesHttps } from "@/lib/request-context";

export async function GET(request: NextRequest) {
  const response = relativeRedirect("/staff-login", 303);
  const domain = staffSessionCookieDomain(request);
  response.cookies.set(STAFF_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUsesHttps(request),
    path: "/",
    maxAge: 0,
    ...(domain ? { domain } : {}),
  });
  return response;
}
