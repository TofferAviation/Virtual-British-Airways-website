import { NextRequest, NextResponse } from "next/server";
import { createPilotSessionToken, PILOT_COOKIE_NAME, pilotSessionCookieOptions } from "@/lib/pilot-auth";
import { findPilotByEmail, markPilotLogin, verifyPilotPassword } from "@/lib/pilot-store";
import { requestUsesHttps } from "@/lib/request-context";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";
  if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });

  const account = await findPilotByEmail(email);
  if (!account || account.status !== "active" || !verifyPilotPassword(password, account.passwordHash)) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  await markPilotLogin(account.id);
  const response = NextResponse.json({ ok: true, pilotNumber: account.pilotNumber });
  response.cookies.set(PILOT_COOKIE_NAME, createPilotSessionToken(account), {
    ...pilotSessionCookieOptions,
    secure: requestUsesHttps(request),
  });
  response.cookies.set("bav_demo_session", "", { path: "/", maxAge: 0, secure: requestUsesHttps(request) });
  return response;
}
