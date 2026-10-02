import { NextRequest, NextResponse } from "next/server";
import { closedBetaEnabled, issueClosedBetaAccess } from "@/lib/closed-beta";
import { issuePilotSession } from "@/lib/pilot-auth";
import { findPilotByEmail, markPilotLogin, verifyPilotPassword } from "@/lib/pilot-store";
import { findStaffUserByEmail, verifyPassword as verifyStaffPassword } from "@/lib/staff-store";

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
  // Active staff may use the same email and password as their pilot account
  // during closed beta. They are trusted beta users without requiring a
  // separate pilot invitation, but the normal pilot-password check above
  // still prevents an email address alone from granting access.
  let staffBetaAccess = false;
  if (closedBetaEnabled() && !account.betaAccess) {
    try {
      const staff = await findStaffUserByEmail(email);
      staffBetaAccess = Boolean(staff && staff.status === "active" && verifyStaffPassword(password, staff.passwordHash));
    } catch {
      return NextResponse.json({ error: "Account access service is temporarily unavailable. Please try again shortly." }, { status: 503 });
    }
    if (!staffBetaAccess) {
      return NextResponse.json({ error: "This website is currently in closed beta. Please use an invitation email address." }, { status: 403 });
    }
  }

  try {
    await markPilotLogin(account.id);
  } catch {
    return NextResponse.json({ error: "Pilot account service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
  const response = NextResponse.json({ ok: true, pilotNumber: account.pilotNumber, mustChangePassword: account.mustChangePassword });
  issuePilotSession(response, request, account);
  if (account.betaAccess || staffBetaAccess) await issueClosedBetaAccess(response, request, { pilotId: account.id, authVersion: account.authVersion });
  return response;
}
