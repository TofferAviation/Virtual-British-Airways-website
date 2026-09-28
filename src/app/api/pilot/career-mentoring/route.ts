import { NextRequest, NextResponse } from "next/server";
import { isCareerFeatureEnabled } from "@/lib/career-experience";
import { requirePilotSession } from "@/lib/pilot-auth";
import { updatePilotMentoringInterest } from "@/lib/pilot-store";
export const dynamic = "force-dynamic";
export async function PATCH(request: NextRequest) { try { if (!isCareerFeatureEnabled("mentoring")) return NextResponse.json({ ok: false, error: "Mentoring preview is not enabled." }, { status: 404 }); const session = await requirePilotSession(); const preferences = await updatePilotMentoringInterest(session.pilotId, await request.json()); return NextResponse.json({ ok: true, preferences }); } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save mentoring interest." }, { status: 400 }); } }
