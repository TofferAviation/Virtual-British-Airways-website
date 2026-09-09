import { NextRequest } from "next/server";
import { PILOT_COOKIE_NAME } from "@/lib/pilot-auth";
import { relativeRedirect, requestUsesHttps } from "@/lib/request-context";

export async function GET(request: NextRequest) {
  const response = relativeRedirect("/", 303);
  const secure = requestUsesHttps(request);
  response.cookies.set(PILOT_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
  response.cookies.set("bav_demo_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
  return response;
}
