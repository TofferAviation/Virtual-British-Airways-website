import { NextRequest, NextResponse } from "next/server";
import { STAFF_COOKIE_NAME, createStaffSessionToken, isStaffAuthConfigured, staffSessionCookieOptions } from "@/lib/staff-auth";
import { getPilotSession } from "@/lib/pilot-auth";
import { pilotSessionCookieDomain, requestUsesHttps } from "@/lib/request-context";
import { resetFoundingStaffPassword } from "@/lib/staff-store";
import { isConfiguredStaffOwner } from "@/lib/staff-owner";

/**
 * Founding owner recovery. Authority comes exclusively from a current pilot
 * session matching the configured founding identity; no staff password,
 * source credential, or host environment secret is accepted from the client.
 */
export async function POST(request: NextRequest) {
  if (!isStaffAuthConfigured()) {
    return NextResponse.json({ error: "Staff sign-in is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }

  const pilot = await getPilotSession();
  if (!pilot || !isConfiguredStaffOwner(pilot.email)) {
    return NextResponse.json({ error: "Sign in to the founding BAV account before recovering the Staff Centre password." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  const password = body?.password ?? "";
  if (!password) return NextResponse.json({ error: "Choose a Staff Centre password." }, { status: 400 });

  try {
    const account = await resetFoundingStaffPassword(pilot.email, password);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(STAFF_COOKIE_NAME, createStaffSessionToken(account), {
      ...staffSessionCookieOptions,
      secure: requestUsesHttps(request),
      domain: pilotSessionCookieDomain(request),
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not recover the Staff Centre password." },
      { status: 400 },
    );
  }
}
