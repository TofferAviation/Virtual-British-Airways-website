import { NextRequest, NextResponse } from "next/server";
import { sendPilotPasswordResetEmail } from "@/lib/email";
import { createPilotPasswordReset } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";

const GENERIC_MESSAGE = "If an active BAV account uses that email address, a reset link has been sent.";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim() ?? "";
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  }

  try {
    const result = await createPilotPasswordReset(email);
    if (result) await sendPilotPasswordResetEmail({ name: result.pilot.name, email: result.pilot.email, token: result.token });
  } catch (error) {
    // Deliberately keep the response non-enumerating and avoid exposing token
    // or mail-configuration details to an unauthenticated caller.
    console.error("Pilot password-reset request could not be completed", error instanceof Error ? error.name : "unknown error");
  }

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
