import { NextRequest, NextResponse } from "next/server";
import { isCareerFeatureEnabled } from "@/lib/career-experience";
import { requirePilotSession } from "@/lib/pilot-auth";
import { updatePilotCareerRoster } from "@/lib/pilot-store";
export const dynamic = "force-dynamic";
export async function PATCH(request: NextRequest) { try { if (!isCareerFeatureEnabled("rosters")) return NextResponse.json({ ok: false, error: "Roster preview is not enabled." }, { status: 404 }); const session = await requirePilotSession(); const preferences = await updatePilotCareerRoster(session.pilotId, await request.json()); return NextResponse.json({ ok: true, preferences }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save roster." }, { status: 400 }); } }
