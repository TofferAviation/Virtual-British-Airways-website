import { NextResponse } from "next/server";
import { ACARS_TOKEN_TTL_SECONDS, authenticateAcarsPilot, createAcarsToken } from "@/lib/acars-auth";
import { createAcarsDeviceSession } from "@/lib/pilot-store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string; password?: string; rememberDevice?: boolean } | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";
  if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  const account = await authenticateAcarsPilot(email, password);
  if (!account) return NextResponse.json({ error: "Invalid pilot credentials." }, { status: 401 });
  const deviceSession = body?.rememberDevice === true ? await createAcarsDeviceSession(account.id) : null;
  return NextResponse.json({
    token: createAcarsToken(account, deviceSession?.id),
    pilot: { id: account.id, pilotNumber: account.pilotNumber, name: account.name, email: account.email, profileImage: account.profileImage },
    ...(deviceSession ? { deviceSessionToken: deviceSession.token } : {}),
    expiresInSeconds: ACARS_TOKEN_TTL_SECONDS,
  });
}
