import { NextRequest, NextResponse } from "next/server";
import { STAFF_COOKIE_NAME, createStaffSessionToken, isStaffAuthConfigured, staffSessionCookieOptions, validateStaffCredentials } from "@/lib/staff-auth";
import { pilotSessionCookieDomain, requestUsesHttps } from "@/lib/request-context";

export async function POST(request: NextRequest) {
  if (!isStaffAuthConfigured()) {
    return NextResponse.json({ error: "Staff sign-in is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";
  if (!email || !password) return NextResponse.json({ error: "Enter your Staff Centre email and password." }, { status: 400 });

  try {
    const account = await validateStaffCredentials(email, password);
    if (!account) return NextResponse.json({ error: "Incorrect Staff Centre email or password." }, { status: 401 });
    const response = NextResponse.json({ ok: true, role: account.roleId });
    response.cookies.set(STAFF_COOKIE_NAME, createStaffSessionToken(account), {
      ...staffSessionCookieOptions,
      secure: requestUsesHttps(request),
      domain: pilotSessionCookieDomain(request),
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Staff account service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}
