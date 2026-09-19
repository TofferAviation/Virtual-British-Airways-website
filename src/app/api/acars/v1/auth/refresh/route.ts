import { NextResponse } from "next/server";
import { ACARS_TOKEN_TTL_SECONDS, createAcarsToken } from "@/lib/acars-auth";
import { renewAcarsDeviceSession } from "@/lib/pilot-store";

/**
 * Rotates a valid encrypted Ember device credential without handling the
 * pilot's password. The old device credential becomes unusable immediately.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { deviceSessionToken?: string } | null;
  const deviceSessionToken = body?.deviceSessionToken?.trim() ?? "";
  const renewed = await renewAcarsDeviceSession(deviceSessionToken);
  if (!renewed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = renewed.pilot;
  return NextResponse.json({
    token: createAcarsToken(account, renewed.id),
    pilot: {
      id: account.id,
      pilotNumber: account.pilotNumber,
      name: account.name,
      email: account.email,
      profileImage: account.profileImage,
      rank: account.rank,
    },
    deviceSessionToken: renewed.token,
    expiresInSeconds: ACARS_TOKEN_TTL_SECONDS,
  });
}
