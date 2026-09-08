import { NextRequest } from "next/server";
import { relativeRedirect, requestUsesHttps } from "@/lib/request-context";

export async function GET(request: NextRequest) {
  const response = relativeRedirect("/", 303);
  response.cookies.set("bav_demo_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: requestUsesHttps(request),
    path: "/",
    maxAge: 0,
  });
  return response;
}
