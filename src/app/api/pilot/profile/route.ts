import { NextResponse } from "next/server";
import { requirePilotSession } from "@/lib/pilot-auth";
import { changePilotPassword, updatePilotProfile, updatePilotSimbriefId } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const session = await requirePilotSession();
    const body = await request.json() as { name?: string; email?: string; currentPassword?: string; newPassword?: string; simbriefPilotId?: string };

    if (body.newPassword != null || body.currentPassword != null) {
      await changePilotPassword(session.pilotId, body.currentPassword ?? "", body.newPassword ?? "");
      return NextResponse.json({ ok: true, message: "Password updated." });
    }

    if (body.simbriefPilotId != null) {
      const pilot = await updatePilotSimbriefId(session.pilotId, body.simbriefPilotId);
      return NextResponse.json({ ok: true, pilot, message: "SimBrief setting updated." });
    }

    const pilot = await updatePilotProfile(session.pilotId, {
      name: body.name ?? session.name,
      email: body.email ?? session.email,
    });
    return NextResponse.json({ ok: true, pilot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update your account.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
