import { NextRequest, NextResponse } from "next/server";
import { isCareerFeatureEnabled } from "@/lib/career-experience";
import { requirePilotSession } from "@/lib/pilot-auth";
import { updatePilotCareerExperiencePreferences } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    if (!isCareerFeatureEnabled("experience")) return NextResponse.json({ ok: false, error: "Career preferences are not enabled." }, { status: 404 });
    const session = await requirePilotSession();
    const preferences = await updatePilotCareerExperiencePreferences(session.pilotId, await request.json());
    return NextResponse.json({ ok: true, preferences, message: "Career preferences saved." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save career preferences.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
