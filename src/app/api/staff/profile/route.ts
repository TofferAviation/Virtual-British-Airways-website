import { NextRequest, NextResponse } from "next/server";
import { requireStaffSession } from "@/lib/staff-auth";
import { changeOwnStaffPassword, updateOwnStaffProfile } from "@/lib/staff-store";

export async function PATCH(request: NextRequest) {
  const session = await requireStaffSession();
  const body = await request.json().catch(() => null) as { name?: string; currentPassword?: string; newPassword?: string } | null;
  if (!body) return NextResponse.json({ error: "Invalid profile update." }, { status: 400 });

  try {
    if (body.name != null) {
      const account = await updateOwnStaffProfile(session.userId, { name: body.name });
      return NextResponse.json({ ok: true, name: account.name, message: "Profile updated." });
    }
    if (body.currentPassword != null || body.newPassword != null) {
      await changeOwnStaffPassword(session.userId, body.currentPassword ?? "", body.newPassword ?? "");
      return NextResponse.json({ ok: true, message: "Password updated." });
    }
    return NextResponse.json({ error: "No profile changes were provided." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update your profile." }, { status: 400 });
  }
}
