import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getPirep } from "@/lib/pilot-operations-store";
import { listMentoringFlightReviews, listPilots } from "@/lib/pilot-store";
import { requireStaffPermission } from "@/lib/staff-auth";
import { MentoringReviewCentre } from "./MentoringReviewCentre";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mentor flight reviews" };

export default async function MentorFlightReviewsPage() {
  await requireStaffPermission("users.edit");
  const [reviews, pilots] = await Promise.all([listMentoringFlightReviews(), listPilots()]);
  const rows = await Promise.all(reviews.map(async (review) => { const pirep = await getPirep(review.pirepId); const mentor = pilots.find((pilot) => pilot.id === review.mentorPilotId); const learner = pilots.find((pilot) => pilot.id === review.learnerPilotId); return { id: review.id, mentorName: mentor?.name ?? "Unknown mentor", learnerName: learner?.name ?? "Unknown learner", flight: pirep ? `${pirep.flightNumber} · ${pirep.from} → ${pirep.to}` : "Flight record unavailable", metrics: pirep ? `${Math.floor(pirep.blockMinutes / 60)}h ${String(pirep.blockMinutes % 60).padStart(2, "0")}m · ${Math.round(pirep.distanceNm).toLocaleString("en-GB")} NM · fuel ${pirep.fuelUsedKg == null ? "—" : `${pirep.fuelUsedKg.toLocaleString("en-GB")} kg`}` : "No telemetry available", approach: review.approach, descentRate: review.descentRate, overall: review.overall, mentorNote: review.mentorNote, createdAt: review.createdAt, staffReviewedAt: review.staffReviewedAt, experienceLevel: review.experienceLevel, bonusPercent: review.bonusPercent, bonusVaPoints: review.bonusVaPoints, bonusTierPoints: review.bonusTierPoints }; }));
  return <><SiteHeader /><main className="career-page"><div className="career-shell"><nav className="career-breadcrumbs"><Link href="/staff/mentoring">Mentoring</Link><span>›</span><strong>Flight reviews</strong></nav><header className="career-hero"><div><span>STAFF MENTORING OVERSIGHT</span><h1>Flight review assessments</h1><p>Review mentor observations against recorded Ember data, track a pilot’s current mentoring experience level, and award only positive staff-selected points.</p></div><Link href="/staff/mentoring">Mentoring centre →</Link></header><MentoringReviewCentre reviews={rows} /></div></main><SiteFooter /></>;
}
