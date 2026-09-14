import { NextResponse } from "next/server";

/**
 * Staff access is deliberately provisioned only through a single-use email
 * invitation. This avoids administrator-chosen passwords being sent over
 * another channel and lets each recipient create their own credential.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Direct staff-account creation has been retired. Use User Permissions → Invite staff member instead." },
    { status: 410 },
  );
}
