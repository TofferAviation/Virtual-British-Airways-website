import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { listMentorApplications, listMentoringMatches, listPilots, MENTOR_MINIMUM_CAREER_HOURS } from "@/lib/pilot-store";
import { requireStaffPermission } from "@/lib/staff-auth";
import { MentoringCentre } from "./MentoringCentre";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mentoring" };

export default async function StaffMentoringPage() {
  await requireStaffPermission("users.edit");
  const [allPilots, matches, applications] = await Promise.all([listPilots(), listMentoringMatches(), listMentorApplications()]);
  const pilots = allPilots.filter((pilot) => pilot.status === "active");
  const simplePilots = pilots.map(({ id, name, pilotNumber, email }) => ({ id, name, pilotNumber, email }));
  const approvedMentorIds = new Set(applications.filter((application) => application.status === "approved" && application.mentorRank).map((application) => application.pilotId));
  const mentors = simplePilots.filter((pilot) => {
    const account = pilots.find((item) => item.id === pilot.id);
    return approvedMentorIds.has(pilot.id) && account?.careerExperience.mentoringInterest === "mentor" && account.hours >= MENTOR_MINIMUM_CAREER_HOURS;
  });
  const learners = simplePilots.filter((pilot) => pilots.find((item) => item.id === pilot.id)?.careerExperience.mentoringInterest === "learn");
  return <><SiteHeader /><main className="career-page"><div className="career-shell"><nav className="career-breadcrumbs"><Link href="/staff">Staff Centre</Link><span>›</span><strong>Mentoring</strong></nav><header className="career-hero"><div><span>CAREER COMMUNITY</span><h1>Mentoring</h1><p>Review mentor applications, set staff-controlled levels, and match approved volunteers with learners. Rewards remain accepted-PIREP only and capped to protect progression.</p></div><Link href="/staff/pilots">Pilot management →</Link></header><MentoringCentre mentors={mentors} learners={learners} matches={matches} applications={applications} pilots={simplePilots} /></div></main><SiteFooter /></>;
}
