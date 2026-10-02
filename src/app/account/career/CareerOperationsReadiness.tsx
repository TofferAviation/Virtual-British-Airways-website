import Link from "next/link";
import { getCareerOperationsPreview } from "@/lib/career-operations";
import type { PilotBooking, PilotFlightPlan, PilotPirep } from "@/lib/pilot-operations-store";
import styles from "./CareerOperationsReadiness.module.css";

export function CareerOperationsReadiness({ booking, flightPlan, pireps }: { booking: PilotBooking | null; flightPlan: PilotFlightPlan | null; pireps: PilotPirep[] }) {
  const operations = getCareerOperationsPreview({ booking, flightPlan, pireps });
  return <article className="career-card career-card-wide career-module career-module-operations"><div className="career-card-head"><div><span>ADVANCED OPERATIONS · OPTIONAL</span><h2>Duty &amp; rest planner</h2></div><Link href={booking ? "/manage-assignment" : "/book"}>{booking ? "Open flight desk →" : "Find a flight →"}</Link></div>
    <p>This private planning view adds virtual duty, rest and turnaround context around your established BAV records. It is a simulation aid only: it never blocks, creates, changes or approves a flight.</p>
    <section className={styles.timeline} aria-label="Optional virtual duty timeline"><div><span>01 · PLAN</span><strong>{operations.assignment.title}</strong><small>{operations.assignment.detail}</small></div><div><span>02 · PREPARE</span><strong>{operations.briefing.title}</strong><small>{operations.briefing.detail}</small></div><div><span>03 · OPERATE</span><strong>{operations.aircraft.title}</strong><small>{operations.aircraft.detail}</small></div></section>
    <section className={`${styles.rest} ${operations.rest.active ? styles.active : ""}`} aria-label="Optional virtual rest guidance"><div><span>VIRTUAL REST GUIDANCE</span><strong>{operations.rest.title}</strong><small>{operations.rest.detail}</small></div><p>Suggested duty check-in: allow around 90 minutes before a published reference departure. Published times remain virtual planning references, not departure gates.</p></section>
    <p className={styles.notice}>No external disruption feed or real-world duty rule is used here. Ember, BA-Radar, PIREP review and existing BAV operational controls remain the authoritative systems.</p>
  </article>;
}
