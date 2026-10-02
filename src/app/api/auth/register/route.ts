import { NextRequest, NextResponse } from "next/server";
import { closedBetaEnabled } from "@/lib/closed-beta";
import { sendPilotWelcomeEmail } from "@/lib/email";
import { issuePilotSession } from "@/lib/pilot-auth";
import { registerPilot } from "@/lib/pilot-store";

export async function POST(request: NextRequest) {
  if (closedBetaEnabled()) {
    return NextResponse.json({ error: "British Airways Virtual is currently in closed beta. Accounts are available by invitation only." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { name?: string; email?: string; password?: string; hub?: string; acceptPilotRules?: boolean } | null;
  try {
    const account = await registerPilot({
      name: body?.name ?? "",
      email: body?.email ?? "",
      password: body?.password ?? "",
      hub: body?.hub,
      acceptPilotRules: body?.acceptPilotRules === true,
    });
    // A delivery outage must never prevent a pilot from creating an account.
    await sendPilotWelcomeEmail(account);
    const response = NextResponse.json({ ok: true, pilotNumber: account.pilotNumber }, { status: 201 });
    issuePilotSession(response, request, account);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the account." }, { status: 400 });
  }
}
