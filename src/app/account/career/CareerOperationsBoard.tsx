import Link from "next/link";
import type { CareerDispatchPlan } from "@/lib/career-dispatcher";
import type { ActiveCareerRotation } from "@/lib/career-experience";
import type { VirtualEvent } from "@/data/events";
import type { PilotBooking, PilotFlightPlan } from "@/lib/pilot-operations-store";
import type { OverallServiceStatus } from "@/lib/service-status-store";
import styles from "./CareerOperationsBoard.module.css";

function eventDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`));
}

function statusLabel(status: OverallServiceStatus["state"]) {
  if (status === "operational") return "Operational";
  if (status === "maintenance") return "Maintenance";
  if (status === "degraded") return "Degraded";
  if (status === "partial_outage") return "Partial outage";
  return "Major outage";
}

export function CareerOperationsBoard({ dispatch, booking, flightPlan, activeRotation, serviceStatus, nextEvent }: {
  dispatch: CareerDispatchPlan | null;
  booking: PilotBooking | null;
  flightPlan: PilotFlightPlan | null;
  activeRotation: ActiveCareerRotation | null;
  serviceStatus: OverallServiceStatus | null;
  nextEvent: VirtualEvent | null;
}) {
  const flightDesk = booking
    ? { title: `${booking.flightNumber} · ${booking.from} → ${booking.to}`, detail: flightPlan?.status === "synced" ? "Briefing linked and ready from the flight desk." : "Assignment held; briefing is still pending.", href: "/manage-assignment", action: "Open flight desk →" }
    : { title: "No active assignment", detail: "Choose a BAV service whenever you are ready to operate.", href: "/book", action: "Find a flight →" };
  const line = activeRotation
    ? { title: activeRotation.title, detail: `${activeRotation.legs.length} sectors in your optional personal line.`, href: "/account/career", action: "Review line →" }
    : { title: "No line bid", detail: "Build a flexible personal line from your eligible home-base network.", href: "/account/career", action: "Bid a line →" };

  return <article className="career-card career-card-wide career-module career-module-operations-board">
    <div className="career-card-head"><div><span>PILOT OPERATIONS BOARD · LIVE CONTEXT</span><h2>Today&apos;s virtual operation</h2></div><Link href="/manage-assignment">Flight desk →</Link></div>
    <p>One view of the established BAV systems around your flying. It is informational only: no card here can book, assign, delay, cancel or approve a flight.</p>
    <section className={styles.grid} aria-label="Pilot operations snapshot">
      <div className={styles.tile}><span>FLIGHT DESK</span><strong>{flightDesk.title}</strong><small>{flightDesk.detail}</small><Link href={flightDesk.href}>{flightDesk.action}</Link></div>
      <div className={styles.tile}><span>ROSTER &amp; LINE</span><strong>{line.title}</strong><small>{dispatch ? `${dispatch.dateLabel}${dispatch.rosterApplied ? " · saved availability applied" : " · flexible planning"}. ${line.detail}` : line.detail}</small><Link href={line.href}>{line.action}</Link></div>
      <div className={styles.tile}><span>BAV SERVICE HEALTH</span><strong className={serviceStatus ? styles[serviceStatus.state] : undefined}>{serviceStatus ? statusLabel(serviceStatus.state) : "Status unavailable"}</strong><small>{serviceStatus?.message ?? "Open the BAV Service Status page for the latest operational notices."}</small><Link href="/service-status">View service status →</Link></div>
      <div className={styles.tile}><span>NEXT COMMUNITY OPERATION</span><strong>{nextEvent ? nextEvent.title : "No published operation"}</strong><small>{nextEvent ? `${eventDate(nextEvent.date)} · ${nextEvent.startUtc}–${nextEvent.endUtc} UTC · ${nextEvent.route.fromName} → ${nextEvent.route.toName}` : "New BAV events will appear here when Operations publishes them."}</small><Link href="/events">{nextEvent ? "View event →" : "Browse events →"}</Link></div>
    </section>
    <p className={styles.note}>Use this as a virtual briefing board. Flight availability, event entry, aircraft selection, operational guidance and service notices remain governed by their linked BAV pages.</p>
  </article>;
}
