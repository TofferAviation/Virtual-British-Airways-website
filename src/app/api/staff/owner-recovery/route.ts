import { NextRequest, NextResponse } from "next/server";
import { getPilotSession } from "@/lib/pilot-auth";
import {
  createStaffSessionToken,
  recoverConfiguredOwnerFromPilot,
  STAFF_COOKIE_NAME,
  staffSessionCookieOptions,
} from "@/lib/staff-auth";
import { relativeRedirect, requestUsesHttps } from "@/lib/request-context";

export async function POST(request: NextRequest) {
  const pilot = await getPilotSession();
  if (!pilot) return relativeRedirect("/login?returnTo=%2Fstaff-login", 303);

  const owner = await recoverConfiguredOwnerFromPilot(pilot.email);
  if (!owner) return relativeRedirect("/staff-login?error=owner-pilot-not-authorized", 303);

  const response = relativeRedirect("/staff", 303);
  response.cookies.set(STAFF_COOKIE_NAME, createStaffSessionToken(owner), {
    ...staffSessionCookieOptions,
    secure: requestUsesHttps(request),
  });
  return response;
}
