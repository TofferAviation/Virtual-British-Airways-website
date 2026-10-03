import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { checkQualificationEligibility, getCareerDashboard } from "@/lib/pilot-career";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";
import { applyForTrainingAction, payForRecurrentTrainingAction, payForTrainingAction } from "../career-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Type Rating Academy" };
const money = (value: number) => `£${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function QualificationsPage({ searchParams }: { searchParams: Promise<{ applied?: string; payment?: string; recurrent?: string; error?: string }> }) {
  const session = await requirePilotSession();
  const pilot = await getPilotById(session.pilotId);
  if (!pilot) redirect("/login");
  const [career, params] = await Promise.all([getCareerDashboard(pilot), searchParams]);
  const eligibilityPairs = await Promise.all(career.definitions.filter((definition) => definition.kind !== "instructor").map(async (definition) => [definition.id, await checkQualificationEligibility(pilot, definition)] as const));
  const eligibilityByDefinition = new Map(eligibilityPairs);
  const qualificationByDefinition = new Map(career.qualifications.map((qualification) => [qualification.qualificationDefinitionId, qualification]));
  const applicationByDefinition = new Map(career.applications.map((application) => [application.qualificationDefinitionId, application]));
  return <><SiteHeader /><main className="career-page"><div className="career-shell">
    <nav className="career-breadcrumbs"><Link href="/account">Pilot account</Link><span>›</span><Link href="/account/career">Career</Link><span>›</span><strong>Type Rating Academy</strong></nav>
    <header className="career-hero"><div><span>TYPE RATING ACADEMY</span><h1>Build your virtual operating record</h1><p>Choose an optional virtual training programme, learn with BAV Operations and earn a staff-approved career record. This is a British Airways Virtual simulation feature, not real-world certification or employment training.</p></div><Link href="/account/finances">Virtual finances →</Link></header>
    {params.applied ? <p className="career-feedback success">Your training application has been submitted to BAV Operations.</p> : null}{params.payment ? <p className="career-feedback success">Virtual training payment recorded. Your training modules are now active.</p> : null}{params.recurrent ? <p className="career-feedback success">Your virtual recurrent-training payment is recorded. BAV Operations can now complete the recurrent check.</p> : null}{params.error ? <p className="career-feedback error">{params.error}</p> : null}
    <section className="career-card career-card-wide career-module career-module-academy" aria-label="How the Type Rating Academy works"><div className="career-card-head"><div><span>YOUR ACADEMY JOURNEY</span><h2>Structured, optional progression</h2></div><Link href="/account/career">Career overview →</Link></div><p>Fly and Career pilots always retain their chosen freedom. Once the separate Realistic Operations policy is introduced, completed Academy records can support that optional experience.</p><ol className="career-academy-steps"><li><b>01</b><div><strong>Check readiness</strong><span>See the transparent rank, block-time and sector requirements for each programme.</span></div></li><li><b>02</b><div><strong>Apply to Operations</strong><span>Your application goes to staff for review; submitting it never grants a rating.</span></div></li><li><b>03</b><div><strong>Complete training</strong><span>Staff record the training modules and required check flight in your virtual career file.</span></div></li><li><b>04</b><div><strong>Keep it current</strong><span>Approved records show their validity and recurrent-training dates in one place.</span></div></li></ol></section>
    <section className="qualification-grid">{career.definitions.filter((definition) => definition.kind !== "instructor").map((definition) => {
      const eligibility = eligibilityByDefinition.get(definition.id)!;
      const qualification = qualificationByDefinition.get(definition.id);
      const application = applicationByDefinition.get(definition.id);
      const recurrentPayment = qualification ? career.transactions.find((transaction) => transaction.category === "recurrent_training" && transaction.relatedQualificationId === qualification.id && transaction.createdAt >= (qualification.lastRecurrentAt ?? qualification.validFrom)) : null;
      return <article className="qualification-card" key={definition.id}>
        <header><span>{definition.kind === "command" ? "COMMAND" : "TYPE RATING"}</span><h2>{definition.name}</h2><p>{definition.description}</p></header>
        <div className="qualification-cost"><span>Virtual training cost</span><strong>{money(definition.virtualTrainingCost)}</strong><small>Recurrent training {money(definition.recurrentTrainingCost)}</small></div>
        {qualification ? <div className="qualification-held"><strong className={`career-status ${qualification.status}`}>{qualification.status.replaceAll("_", " ")}</strong><span>{qualification.source === "grandfathered" ? "Grandfathered during BAV career migration" : `Valid until ${qualification.validUntil ? new Date(qualification.validUntil).toLocaleDateString("en-GB") : "further notice"}`}</span>{["recurrent_due", "expired"].includes(qualification.status) ? recurrentPayment ? <small>Virtual recurrent training is paid. BAV Operations will record the completed recurrent check.</small> : <form action={payForRecurrentTrainingAction}><input type="hidden" name="qualificationId" value={qualification.id} /><button className="career-button" type="submit">Pay for recurrent training</button></form> : null}</div> : <>
          <h3>Eligibility</h3><ul className="qualification-checks">{eligibility.checks.map((check) => <li className={check.met ? "met" : "unmet"} key={check.key}><b>{check.met ? "✓" : "×"}</b><div><strong>{check.label}</strong><span>{check.detail}</span></div></li>)}</ul>
          {application ? <div className="qualification-application"><strong>{application.status.replaceAll("_", " ")}</strong><span>{application.assignedInstructor ? `Instructor: ${application.assignedInstructor}` : application.staffNote ?? "BAV Operations will update this training record."}</span>{application.status === "approved" ? <form action={payForTrainingAction}><input type="hidden" name="applicationId" value={application.id} /><button className="career-button" type="submit">Confirm virtual training payment</button></form> : null}{application.status === "training_in_progress" || application.status === "check_flight_required" ? <small>{application.modules.filter((module) => module.completedAt).length} / {application.modules.length} modules completed{application.status === "check_flight_required" ? " · Check flight required" : ""}</small> : null}</div> : <form action={applyForTrainingAction}><input type="hidden" name="definitionId" value={definition.id} /><button className="career-button" type="submit" disabled={!eligibility.eligible}>{eligibility.eligible ? "Apply for training" : "Requirements not met"}</button></form>}
        </>}
      </article>;
    })}</section>
  </div></main><SiteFooter /></>;
}
