import { NextRequest, NextResponse } from "next/server";
import { acceptStaffInvitation } from "@/lib/staff-store";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Invitation token is required." }, { status: 400 });
  }

  try {
    const user = await acceptStaffInvitation(token);
    return NextResponse.json({ ok: true, email: user.email });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not accept staff invitation." },
      { status: 400 },
    );
  }
}
