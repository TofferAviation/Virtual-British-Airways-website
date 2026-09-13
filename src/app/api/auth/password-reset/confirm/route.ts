import { NextRequest, NextResponse } from "next/server";
import { resetPilotPassword } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: string; password?: string } | null;
  try {
    await resetPilotPassword(body?.token?.trim() ?? "", body?.password ?? "");
    return NextResponse.json({ ok: true, message: "Your password has been reset. You can now sign in." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reset your password.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
