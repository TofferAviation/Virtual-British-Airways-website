import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getCareerDashboard } from "@/lib/pilot-career";
import { isCareerFeatureEnabled } from "@/lib/career-experience";
import { getCareerDispatchSuggestions } from "@/lib/career-dispatcher";
import { nextPilotRank } from "@/lib/pilot-ranks";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById, getPilotMentoringExperience, getPilotMentoringStatus, listMentoringFlightReviews, MENTOR_MINIMUM_CAREER_HOURS } from "@/lib/pilot-store";
import { CareerExperienceForm } from "./CareerExperienceForm";
import { CareerDispatcher } from "./CareerDispatcher";
import { CareerModeGuide } from "./CareerModeGuide";
import { CareerOperationsReadiness } from "./CareerOperationsReadiness";
import { CareerRosterForm } from "./CareerRosterForm";
import { CareerMentoringForm } from "./CareerMentoringForm";
import { CareerPerformance } from "./CareerPerformance";
import { CareerFleetPortfolio } from "./CareerFleetPortfolio";
import { getActiveFleetFlightAssignmentForPilot, listFleetAircraft } from "@/lib/fleet-service";
import { getActivePilotBooking, getPirep, getPilotFlightPlan, listPilotPireps } from "@/lib/pilot-operations-store";
import { redirect } from "next/navigation";
import { MentoringPortfolio } from "./MentoringPortfolio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Career & Qualifications" };

function money(value: number) { return `£${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default async function CareerPage() {
  const session = await requirePilotSession();
  const pilot = await getPilotById(session.pilotId);
  if (!pilot) redirect("/login");
  const career = await getCareerDashboard(pilot);
  const next = nextPilotRank(pilot.hours);
  const issued = new Set(career.qualifications.filter((qualification) => qualification.status === "valid" || qualification.status === "expiring_soon").map((qualification) => qualification.qualificationDefinitionId));
  const activeTraining = career.applications.filter((application) => !["failed", "type_rating_issued", "expired", "suspended"].includes(application.status));
  const guidedCareer = pilot.careerExperience.mode !== "fly";
  const advancedOperations = pilot.careerExperience.mode === "realistic_operations" && isCareerFeatureEnabled("advanced_operations");
  const passportPreview = isCareerFeatureEnabled("passport");
  const fleetPreview = isCareerFeatureEnabled("fleet");
  const mentoringPreview = isCareerFeatureEnabled("mentoring");
  const [dispatchSuggestions, activeBooking, recentPireps, mentoringStatus, mentoringExperience, mentoringReviews] = await Promise.all([
    guidedCareer && isCareerFeatureEnabled("dispatcher") ? getCareerDispatchSuggestions(pilot) : Promise.resolve(null),
    advancedOperations ? getActivePilotBooking(pilot.id) : Promise.resolve(null),
    advancedOperations || passportPreview || fleetPreview || (guidedCareer && isCareerFeatureEnabled("debrief")) ? listPilotPireps(pilot.id) : Promise.resolve([]),
    mentoringPreview ? getPilotMentoringStatus(pilot.id) : Promise.resolve(null),
    mentoringPreview ? getPilotMentoringExperience(pilot.id) : Promise.resolve(null),
    mentoringPreview ? listMentoringFlightReviews({ mentorPilotId: pilot.id }) : Promise.resolve([]),
  ]);
  const mentoringPortfolio = await Promise.all(mentoringReviews.map(async (review) => {
    const flight = await getPirep(review.pirepId);
    const learner = await getPilotById(review.learnerPilotId);
    return flight && learner ? { id: review.id, learnerName: learner.name, flightNumber: flight.flightNumber, from: flight.from, to: flight.to, aircraft: flight.aircraft, completedAt: flight.completedAt, blockMinutes: flight.blockMinutes, distanceNm: flight.distanceNm, fuelUsedKg: flight.fuelUsedKg, staffReviewedAt: review.staffReviewedAt } : null;
  }));
  const activeFlightPlan = activeBooking && advancedOperations ? await getPilotFlightPlan(activeBooking.id, pilot.id) : null;
  const [fleetAircraft, fleetAssignment] = fleetPreview ? await Promise.all([listFleetAircraft().catch(() => []), getActiveFleetFlightAssignmentForPilot({ subject: `bav:${pilot.id}`, displayName: pilot.name, fleetRole: "pilot" }).catch(() => null)]) : [[], null];
  return <><SiteHeader /><main className="career-page"><div className="career-shell">
    <nav className="career-breadcrumbs"><Link href="/account">Pilot account</Link><span>›</span><strong>Career & qualifications</strong></nav>
    <header className="career-hero"><div><span>PILOT CAREER</span><h1>Career & qualifications</h1><p>A professional virtual-airline progression record. All balances, earnings and training costs are fictional British Airways Virtual economy values.</p></div><Link href="/account/qualifications">Explore training →</Link></header>
    <section className="career-metrics"><article><span>Current rank</span><strong>{pilot.rank}</strong><small>{next ? `${Math.max(0, next.minimumHours - pilot.hours).toFixed(1)} h to ${next.rank}` : "Highest automatic career rank"}</small></article><article><span>Career block time</span><strong>{pilot.hours.toFixed(1)} h</strong><small>{pilot.flights} accepted sectors</small></article><article><span>Virtual account balance</span><strong>{money(career.finance.currentBalance)}</strong><small>Lifetime earnings {money(career.finance.lifetimeEarnings)}</small></article><article><span>Active qualifications</span><strong>{issued.size}</strong><small>{issued.size ? [...issued].join(" · ") : "No active family rating"}</small></article></section>
    <section className="career-grid"><article className="career-card career-card-wide"><div className="career-card-head"><div><span>CAREER PROGRESSION</span><h2>{pilot.rank}</h2></div><Link href="/account/finances">Pilot finances →</Link></div>{next ? <><div className="career-progress"><i style={{ width: `${Math.min(100, (pilot.hours / next.minimumHours) * 100)}%` }} /></div><p><strong>{pilot.hours.toFixed(1)} / {next.minimumHours} hours</strong> toward {next.rank}. Rank, command authority and type ratings remain separate operational records.</p></> : <p>You have reached the highest automatic career rank. Instructor and command privileges still require their own qualifications.</p>}</article>
      <article className="career-card"><div className="career-card-head"><div><span>VIRTUAL FINANCES</span><h2>{money(career.finance.currentBalance)}</h2></div></div><p>This month: <strong>{money(career.finance.currentMonthEarnings)}</strong><br />Training expenditure and flight earnings are recorded permanently in the ledger.</p><Link href="/account/finances">View transactions →</Link></article>
      <article className="career-card"><div className="career-card-head"><div><span>ACTIVE TRAINING</span><h2>{activeTraining.length}</h2></div></div>{activeTraining.length ? <ul className="career-compact-list">{activeTraining.map((application) => <li key={application.id}><strong>{career.definitions.find((definition) => definition.id === application.qualificationDefinitionId)?.name ?? application.qualificationDefinitionId}</strong><span>{application.status.replaceAll("_", " ")}</span></li>)}</ul> : <p>No training programme is currently in progress.</p>}<Link href="/account/qualifications">Manage training →</Link></article>
      <article className="career-card career-card-wide"><div className="career-card-head"><div><span>QUALIFICATION RECORD</span><h2>Professional standing</h2></div><Link href="/account/qualifications">All qualifications →</Link></div>{career.qualifications.length ? <div className="career-record-grid">{career.qualifications.map((qualification) => { const definition = career.definitions.find((item) => item.id === qualification.qualificationDefinitionId); return <div key={qualification.id}><strong>{definition?.name ?? qualification.qualificationDefinitionId}</strong><span className={`career-status ${qualification.status}`}>{qualification.status.replaceAll("_", " ")}</span><small>{qualification.source === "grandfathered" ? "Grandfathered during career migration" : `Issued ${new Date(qualification.issuedAt).toLocaleDateString("en-GB")}`}</small></div>; })}</div> : <p>Begin with an eligible type-rating programme. Payment alone never issues a qualification.</p>}</article>
      {isCareerFeatureEnabled("experience") ? <CareerExperienceForm initialPreferences={pilot.careerExperience} /> : null}
      {isCareerFeatureEnabled("experience") ? <CareerModeGuide preferences={pilot.careerExperience} /> : null}
      {dispatchSuggestions ? <CareerDispatcher plan={dispatchSuggestions} hub={pilot.hub} /> : null}
      {advancedOperations ? <CareerOperationsReadiness booking={activeBooking} flightPlan={activeFlightPlan} pireps={recentPireps} /> : null}
      {guidedCareer && isCareerFeatureEnabled("debrief") ? <CareerPerformance pireps={recentPireps} /> : null}
      {isCareerFeatureEnabled("rosters") ? <CareerRosterForm rosterDays={pilot.careerExperience.rosterDays} /> : null}
      {passportPreview ? <article className="career-card career-card-wide career-module career-module-passport"><div className="career-card-head"><div><span>CAREER PASSPORT · PREVIEW</span><h2>Your BAV journey</h2></div><Link href="/account/career/passport">Open Passport →</Link></div><p>{pilot.flights} accepted flights · {pilot.hours.toFixed(1)} career hours · {pilot.distanceNm.toLocaleString()} nautical miles · {pilot.awards.length} career awards · {career.qualifications.length} qualification records.</p><p>{recentPireps.length ? `Latest recorded flight: ${recentPireps[0].flightNumber} · ${recentPireps[0].from} → ${recentPireps[0].to}.` : "Your first accepted BAV flight will begin your passport history."} This is a read-only view of the established BAV records; it cannot alter them.</p></article> : null}
      {fleetPreview ? <CareerFleetPortfolio fleetAircraft={fleetAircraft} pireps={recentPireps} qualifications={career.qualifications} activeAssignment={fleetAssignment?.flightReference ?? null} /> : null}
      {mentoringPreview ? <CareerMentoringForm initialInterest={pilot.careerExperience.mentoringInterest} careerHours={pilot.hours} mentorMinimumHours={MENTOR_MINIMUM_CAREER_HOURS} status={mentoringStatus ?? { application: null, match: null }} /> : null}
      {mentoringPreview ? <MentoringPortfolio records={mentoringPortfolio.filter((record): record is NonNullable<typeof record> => record !== null)} /> : null}
      {mentoringPreview && mentoringExperience ? <article className="career-card career-card-wide career-module career-module-mentoring"><div className="career-card-head"><div><span>MENTORING PROGRESS · STAFF REVIEWED</span><h2>{mentoringExperience.level === "rookie" ? "Rookie pilot" : mentoringExperience.level === "developing" ? "Developing pilot" : "Experienced pilot"}</h2></div></div><p>Your current mentoring experience level is based on staff-reviewed coaching records. It is used for positive progression recognition only: coaching notes and staff assessments never remove flight credit, VA Points, or Tier Points.</p></article> : null}
    </section>
  </div></main><SiteFooter /></>;
}
