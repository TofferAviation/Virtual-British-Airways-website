import Link from "next/link";
import type { CareerDispatchPlan, CareerDispatchSuggestion } from "@/lib/career-dispatcher";
import styles from "./CareerDispatcher.module.css";

function hrefFor(flight: CareerDispatchSuggestion) {
  const params = new URLSearchParams({ from: flight.from, to: flight.to, date: flight.date });
  if (flight.isVirtualService) params.set("flexible", "1");
  return `/book?${params}`;
}

export function CareerDispatcher({ plan, hub }: { plan: CareerDispatchPlan; hub: string }) {
  return <article className="career-card career-card-wide career-module career-module-dispatcher">
    <div className="career-card-head"><div><span>CAREER DISPATCHER · PREVIEW</span><h2>Where could you fly next?</h2></div><Link href={`/book?hub=${encodeURIComponent(hub)}`}>Browse the schedule →</Link></div>
    <p>Suggestions use the current BAV booking network, your home hub and existing aircraft eligibility. They are suggestions only: choosing one never books a flight or changes your operational record.</p>
    <p className={styles.planning}><strong>Planning date: {plan.dateLabel}.</strong> {plan.rosterApplied ? "This is the next day in your saved availability." : "Set your availability to have the Dispatcher plan around your usual flying days."}</p>
    {plan.suggestions.length ? <div className={styles.list}>{plan.suggestions.map((flight) => <div className={styles.flight} key={flight.routeId}><div><strong>{flight.number} · {flight.from} → {flight.to}</strong><span>{flight.departure}–{flight.arrival} UTC · {flight.aircraft} · {flight.duration}</span><small>{flight.reason}{flight.isVirtualService ? " BAV virtual service." : ""}</small></div><Link href={hrefFor(flight)}>Review flight →</Link></div>)}</div> : <p className={styles.empty}>There are no eligible bookable suggestions from your current hub for the selected planning day. The live schedule remains available to browse.</p>}
    <p className={styles.notice}>A real BAV service may be shown as a BAV virtual service until Operations publishes verified airline timetable details. This feature does not represent British Airways employment or operating procedures.</p>
  </article>;
}
