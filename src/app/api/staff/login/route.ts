import { NextRequest, NextResponse } from "next/server";
import {
  STAFF_COOKIE_NAME,
  createStaffSessionToken,
  isStaffAuthConfigured,
  staffSessionCookieOptions,
  validateStaffCredentials,
} from "@/lib/staff-auth";

export async function POST(request: NextRequest) {
  if (!isStaffAuthConfigured()) {
    return NextResponse.json(
      { error: "Staff login is not configured. Add the BAV_STAFF_* environment variables first." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";

  if (!email || !password || !validateStaffCredentials(email, password)) {
    return NextResponse.json({ error: "Invalid staff email or password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(STAFF_COOKIE_NAME, createStaffSessionToken(email), staffSessionCookieOptions);
  return response;
}
