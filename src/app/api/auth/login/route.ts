import { NextRequest, NextResponse } from "next/server";
import { issuePilotSession } from "@/lib/pilot-auth";
import { findPilotByEmail, markPilotLogin, verifyPilotPassword } from "@/lib/pilot-store";

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
  issuePilotSession(response, request, account);
  return response;
}
