import { NextRequest, NextResponse } from "next/server";
import { isStaffAuthConfigured, issueStaffSession, validateStaffCredentials } from "@/lib/staff-auth";

export async function POST(request: NextRequest) {
  if (!isStaffAuthConfigured()) {
    return NextResponse.json({ error: "Staff sign-in is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = body?.email?.trim() ?? "";
  const password = body?.password ?? "";
  if (!email || !password) return NextResponse.json({ error: "Enter your Staff Centre email and password." }, { status: 400 });

  try {
    const account = await validateStaffCredentials(email, password);
    if (!account) return NextResponse.json({ error: "Incorrect Staff Centre email or password." }, { status: 401 });
    const response = NextResponse.json({ ok: true, role: account.roleId });
    issueStaffSession(response, request, account);
    return response;
  } catch {
    return NextResponse.json({ error: "Staff account service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}
