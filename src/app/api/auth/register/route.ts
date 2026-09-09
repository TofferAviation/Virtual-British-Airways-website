import { NextRequest, NextResponse } from "next/server";
import { createPilotSessionToken, PILOT_COOKIE_NAME, pilotSessionCookieOptions } from "@/lib/pilot-auth";
import { registerPilot } from "@/lib/pilot-store";
import { requestUsesHttps } from "@/lib/request-context";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { name?: string; email?: string; password?: string } | null;
  try {
    const account = await registerPilot({
      name: body?.name ?? "",
      email: body?.email ?? "",
      password: body?.password ?? "",
    });
    const response = NextResponse.json({ ok: true, pilotNumber: account.pilotNumber }, { status: 201 });
    response.cookies.set(PILOT_COOKIE_NAME, createPilotSessionToken(account), {
      ...pilotSessionCookieOptions,
      secure: requestUsesHttps(request),
    });
    response.cookies.set("bav_demo_session", "", { path: "/", maxAge: 0, secure: requestUsesHttps(request) });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the account." }, { status: 400 });
  }
}
