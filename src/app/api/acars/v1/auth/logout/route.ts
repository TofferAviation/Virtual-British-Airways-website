import { NextResponse } from "next/server";
import { revokeAcarsDeviceSession } from "@/lib/pilot-store";

/** Revokes the encrypted Ember device session; repeated sign-out is harmless. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { deviceSessionToken?: string } | null;
  const deviceSessionToken = body?.deviceSessionToken?.trim() ?? "";
  await revokeAcarsDeviceSession(deviceSessionToken);
  return NextResponse.json({ ok: true });
}
