import { NextRequest, NextResponse } from "next/server";
import { STAFF_COOKIE_NAME } from "@/lib/staff-auth";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/staff-login", request.url));
  response.cookies.set(STAFF_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
