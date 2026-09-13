import { NextRequest, NextResponse } from "next/server";
import { getPilotSession } from "@/lib/pilot-auth";
import {
  createStaffSessionToken,
  recoverConfiguredOwnerFromPilot,
  STAFF_COOKIE_NAME,
  staffSessionCookieOptions,
} from "@/lib/staff-auth";
import { relativeRedirect, requestUsesHttps } from "@/lib/request-context";

function safeReturnTo(request: NextRequest) {
  const candidate = request.nextUrl.searchParams.get("returnTo") ?? "/staff";
  return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/staff";
}

async function recoverOwnerSession(request: NextRequest) {
  const pilot = await getPilotSession();
  if (!pilot) return relativeRedirect("/login?returnTo=%2Fstaff-login", 303);

  const owner = await recoverConfiguredOwnerFromPilot(pilot.email);
  if (!owner) return relativeRedirect("/staff-login?error=owner-pilot-not-authorized", 303);

  const response = relativeRedirect(safeReturnTo(request), 303);
  response.cookies.set(STAFF_COOKIE_NAME, createStaffSessionToken(owner), {
    ...staffSessionCookieOptions,
    secure: requestUsesHttps(request),
  });
  return response;
}

// The GET handler is intentional: /staff can redirect an already authenticated
// owner pilot here to establish their same-origin staff session without a UI
// step. It grants no access unless the existing HttpOnly pilot session is the
// fixed master-owner identity.
export async function GET(request: NextRequest) {
  return recoverOwnerSession(request);
}

export async function POST(request: NextRequest) {
  return recoverOwnerSession(request);
}
