import Link from "next/link";
import type { PilotBooking, PilotFlightPlan, PilotPirep } from "@/lib/pilot-operations-store";
import styles from "./CareerOperationsReadiness.module.css";

export function CareerOperationsReadiness({ booking, flightPlan, latestPirep }: { booking: PilotBooking | null; flightPlan: PilotFlightPlan | null; latestPirep: PilotPirep | null }) {
  const assignment = booking ? `${booking.flightNumber} · ${booking.from} → ${booking.to}` : "No active assignment";
  const briefing = !booking ? "Choose a flight first" : flightPlan?.status === "synced" ? "Briefing synced" : "Briefing pending";
  const report = latestPirep ? `${latestPirep.flightNumber} · ${latestPirep.status.replaceAll("_", " ")}` : "No flight reports yet";
  return <article className="career-card career-card-wide career-module career-module-operations"><div className="career-card-head"><div><span>REALISTIC OPERATIONS · PREVIEW</span><h2>Operational readiness</h2></div><Link href={booking ? "/manage-assignment" : "/book"}>{booking ? "Open flight desk →" : "Find a flight →"}</Link></div>
    <p>These checks reflect the existing BAV workflow. They are a planning aid only and never create, change or approve an operational record.</p>
    <div className={styles.grid}><div><span>ASSIGNMENT</span><strong>{assignment}</strong><small>{booking ? `${booking.date} · ${booking.aircraft}` : "Select from the current BAV schedule."}</small></div><div><span>SIMBRIEF</span><strong>{briefing}</strong><small>{booking ? "Use the current flight desk to prepare the OFP." : "A flight plan follows an active assignment."}</small></div><div><span>LATEST PIREP</span><strong>{report}</strong><small>{latestPirep?.landingFpm == null ? "Landing data appears after a completed report." : `${latestPirep.landingFpm} fpm landing recorded.`}</small></div></div>
    <p className={styles.notice}>Ember, BA-Radar, PIREP review and any operational restrictions remain governed by their existing BAV systems.</p>
  </article>;
}
