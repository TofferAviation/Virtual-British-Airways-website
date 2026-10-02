import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { listMentoringMatches, listPilots } from "@/lib/pilot-store";
import { requireStaffPermission } from "@/lib/staff-auth";
import { MentoringCentre } from "./MentoringCentre";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mentoring" };

export default async function StaffMentoringPage() {
  await requireStaffPermission("users.edit");
  const [allPilots, matches] = await Promise.all([listPilots(), listMentoringMatches()]);
  const pilots = allPilots.filter((pilot) => pilot.status === "active");
  const simplePilots = pilots.map(({ id, name, pilotNumber, email }) => ({ id, name, pilotNumber, email }));
  const mentors = simplePilots.filter((pilot) => pilots.find((item) => item.id === pilot.id)?.careerExperience.mentoringInterest === "mentor");
  const learners = simplePilots.filter((pilot) => pilots.find((item) => item.id === pilot.id)?.careerExperience.mentoringInterest === "learn");
  return <><SiteHeader /><main className="career-page"><div className="career-shell"><nav className="career-breadcrumbs"><Link href="/staff">Staff Centre</Link><span>›</span><strong>Mentoring</strong></nav><header className="career-hero"><div><span>CAREER COMMUNITY</span><h1>Mentoring</h1><p>Match volunteers and learners manually. Mentor rewards are staff-gated, accepted-PIREP only, and capped to protect the progression system.</p></div><Link href="/staff/pilots">Pilot management →</Link></header><MentoringCentre mentors={mentors} learners={learners} matches={matches} pilots={simplePilots} /></div></main><SiteFooter /></>;
}
