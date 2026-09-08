import { NextRequest } from "next/server";
import { relativeRedirect, requestUsesHttps } from "@/lib/request-context";

export async function GET(request: NextRequest) {
  const response = relativeRedirect("/account", 303);
  response.cookies.set("bav_demo_session", "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUsesHttps(request),
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
