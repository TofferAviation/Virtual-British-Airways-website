import { NextRequest, NextResponse } from "next/server";
import { issuePilotSession, requirePilotSession } from "@/lib/pilot-auth";
import { changePilotPassword, getPilotById, updatePilotProfile, updatePilotSimbriefId } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const session = await requirePilotSession();
    const body = await request.json() as { name?: string; email?: string; currentPassword?: string; newPassword?: string; simbriefPilotId?: string };

    if (body.newPassword != null || body.currentPassword != null) {
      await changePilotPassword(session.pilotId, body.currentPassword ?? "", body.newPassword ?? "");
      const account = await getPilotById(session.pilotId);
      if (!account) throw new Error("Pilot account not found.");
      const response = NextResponse.json({ ok: true, message: "Password updated." });
      // The password change invalidates other sessions while keeping this
      // authenticated browser signed in with a freshly issued session.
      issuePilotSession(response, request, account);
      return response;
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
