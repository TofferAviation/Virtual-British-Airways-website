import { NextRequest, NextResponse } from "next/server";
import { getPirep } from "@/lib/pilot-operations-store";
import { listMentoringFlightReviews, staffAssessMentoringFlightReview, type PilotMentoringExperienceLevel } from "@/lib/pilot-store";
import { requireStaffPermission } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireStaffPermission("users.edit");
    const body = await request.json() as Record<string, unknown>;
    const experienceLevel = body.experienceLevel === "rookie" || body.experienceLevel === "developing" || body.experienceLevel === "experienced" ? body.experienceLevel as PilotMentoringExperienceLevel : null;
    const bonusPercent = Number(body.bonusPercent);
    if (!experienceLevel) throw new Error("Choose a pilot experience level.");
    const review = (await listMentoringFlightReviews()).find((item) => item.id === String(body.reviewId ?? ""));
    if (!review || review.staffReviewedAt) throw new Error("That mentoring review is no longer awaiting staff assessment.");
    const pirep = await getPirep(review.pirepId);
    if (!pirep || pirep.pilotId !== review.learnerPilotId || pirep.source !== "acars" || pirep.status !== "accepted") throw new Error("The linked Ember flight must be accepted before a staff bonus can be assessed.");
    const assessment = await staffAssessMentoringFlightReview({ reviewId: review.id, experienceLevel, bonusPercent, baseVaPoints: pirep.pointsAwarded, baseTierPoints: pirep.tierPointsAwarded, staffName: session.name });
    return NextResponse.json({ ok: true, assessment });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to assess mentoring review." }, { status: 400 });
  }
}
