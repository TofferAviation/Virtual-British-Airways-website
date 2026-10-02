import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getActiveAcarsSessionForPilot } from "@/lib/acars-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { listPilotPireps } from "@/lib/pilot-operations-store";
import { listActiveMentoringLearners, listMentoringFlightReviews } from "@/lib/pilot-store";
import { MentoringFlightDesk } from "./MentoringFlightDesk";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mentor flight desk" };

export default async function MentorFlightDeskPage() {
  const session = await requirePilotSession();
  const learners = await listActiveMentoringLearners(session.pilotId);
  if (!learners.length) redirect("/account/career");
  const [reviewed, records, activeSessions] = await Promise.all([
    listMentoringFlightReviews({ mentorPilotId: session.pilotId }),
    Promise.all(learners.map(async (learner) => ({ learner, pireps: await listPilotPireps(learner.pilotId) }))),
    Promise.all(learners.map(async (learner) => ({ learner, session: await getActiveAcarsSessionForPilot(learner.pilotId).catch(() => null) }))),
  ]);
  const flights = records.flatMap(({ learner, pireps }) => pireps.filter((pirep) => pirep.source === "acars").map((pirep) => ({ ...pirep, learnerName: learner.name }))).sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  const liveFlights = activeSessions.flatMap(({ learner, session: active }) => active ? [{ learnerName: learner.name, flightNumber: active.flightNumber, from: active.from, to: active.to, aircraft: active.aircraft, startedAt: active.startedAt, distanceNm: active.distanceNm, fuelUsedKg: active.firstFuelKg != null && active.lastFuelKg != null ? Math.max(0, Math.round(active.firstFuelKg - active.lastFuelKg)) : null, altitudeFt: active.lastSnapshot?.altitudeFt ?? null, groundSpeedKt: active.lastSnapshot?.groundSpeedKt ?? null, verticalSpeedFpm: active.lastSnapshot?.verticalSpeedFpm ?? null }] : []);
  return <><SiteHeader /><main className="career-page"><div className="career-shell"><nav className="career-breadcrumbs"><Link href="/account/career">Career</Link><span>›</span><strong>Mentor flight desk</strong></nav><header className="career-hero"><div><span>MENTORING · READ-ONLY</span><h1>Mentor flight desk</h1><p>Observe the Ember activity of pilots you are actively mentoring, then record supportive, structured flight coaching for staff review.</p></div><Link href="/account/career">Back to Career →</Link></header><MentoringFlightDesk flights={flights} liveFlights={liveFlights} reviewedFlightIds={reviewed.map((review) => review.pirepId)} /></div></main><SiteFooter /></>;
}
