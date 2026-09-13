import { NextRequest, NextResponse } from "next/server";
import { createPilotSessionToken, PILOT_COOKIE_NAME, pilotSessionCookieOptions } from "@/lib/pilot-auth";
import { findPilotByEmail, markPilotLogin, verifyPilotPassword } from "@/lib/pilot-store";
import { pilotSessionCookieDomain, requestUsesHttps } from "@/lib/request-context";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";
  if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });

  let account;
  try {
    account = await findPilotByEmail(email);
  } catch {
    return NextResponse.json({ error: "Pilot account service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
  if (!account || account.status !== "active" || !verifyPilotPassword(password, account.passwordHash)) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  try {
    await markPilotLogin(account.id);
  } catch {
    return NextResponse.json({ error: "Pilot account service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
  const response = NextResponse.json({ ok: true, pilotNumber: account.pilotNumber });
  response.cookies.set(PILOT_COOKIE_NAME, createPilotSessionToken(account), {
    ...pilotSessionCookieOptions,
    secure: requestUsesHttps(request),
    domain: pilotSessionCookieDomain(request),
  });
  // Retire the pre-reset host-only cookie on the current hostname. The new v2
  // cookie above is the sole source of the BAV and Staff Centre session.
  response.cookies.set("bav_pilot_session", "", { path: "/", maxAge: 0, secure: requestUsesHttps(request) });
  response.cookies.set("bav_demo_session", "", { path: "/", maxAge: 0, secure: requestUsesHttps(request) });
  return response;
}
