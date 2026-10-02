import { NextRequest, NextResponse } from "next/server";
import { isCareerFeatureEnabled } from "@/lib/career-experience";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPirep } from "@/lib/pilot-operations-store";
import { createMentoringFlightReview, listActiveMentoringLearners } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!isCareerFeatureEnabled("mentoring")) return NextResponse.json({ ok: false, error: "Mentoring preview is not enabled." }, { status: 404 });
    const session = await requirePilotSession();
    const body = await request.json() as Record<string, unknown>;
    const pirep = await getPirep(String(body.pirepId ?? ""));
    const learners = await listActiveMentoringLearners(session.pilotId);
    if (!pirep || !learners.some((learner) => learner.pilotId === pirep.pilotId) || pirep.source !== "acars") throw new Error("Choose an Ember flight from your current learner.");
    const review = await createMentoringFlightReview({ mentorPilotId: session.pilotId, learnerPilotId: pirep.pilotId, pirepId: pirep.id, approach: body.approach as "within_parameters" | "too_high" | "too_low" | "unstable" | "not_observed", descentRate: body.descentRate as "within_parameters" | "high" | "low" | "not_observed", overall: body.overall as "progressing" | "needs_coaching" | "ready_for_next_step", mentorNote: String(body.mentorNote ?? "") });
    return NextResponse.json({ ok: true, review });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to submit mentoring review." }, { status: 400 });
  }
}
