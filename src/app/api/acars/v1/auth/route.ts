import { NextResponse } from "next/server";
import { authenticateAcarsPilot, createAcarsToken } from "@/lib/acars-auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";
  if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  const account = await authenticateAcarsPilot(email, password);
  if (!account) return NextResponse.json({ error: "Invalid pilot credentials." }, { status: 401 });
  return NextResponse.json({
    token: createAcarsToken(account),
    pilot: { id: account.id, pilotNumber: account.pilotNumber, name: account.name, email: account.email },
    expiresInSeconds: 60 * 60 * 12,
  });
}
