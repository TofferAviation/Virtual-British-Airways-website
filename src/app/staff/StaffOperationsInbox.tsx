import Link from "next/link";
import { listLiveAcarsSessions } from "@/lib/acars-store";
import { isFleetAircraftBookable, listFleetAircraft } from "@/lib/fleet-service";
import { listAllPireps } from "@/lib/pilot-operations-store";
import { listMentorApplications, listMentoringFlightReviews, listPilots } from "@/lib/pilot-store";
import { overallServiceStatus, getServiceStatusState, serviceStateLabel } from "@/lib/service-status-store";
import { listAllTickets } from "@/lib/ticket-store";

type StaffOperationsInboxProps = {
  canReviewPireps: boolean;
  canManageMentoring: boolean;
  canViewSupport: boolean;
  canViewFleet: boolean;
  canViewLiveOperations: boolean;
  canManageClosedBeta: boolean;
  canViewServiceStatus: boolean;
  activeStaffCount: number;
};

type InboxItem = {
  id: string;
  icon: string;
  count: number;
  title: string;
  detail: string;
  href: string;
  tone: "clear" | "attention" | "urgent";
};

/**
 * Permission-aware work queue for the Staff Centre landing page. The count is
 * calculated when the page opens, and a staff member only sees queues they
 * already have permission to open.
 */
export async function StaffOperationsInbox({
  canReviewPireps,
  canManageMentoring,
  canViewSupport,
  canViewFleet,
  canViewLiveOperations,
  canManageClosedBeta,
  canViewServiceStatus,
  activeStaffCount,
}: StaffOperationsInboxProps) {
  const [pireps, tickets, mentorApplications, mentoringReviews, fleet, sessions, pilots, serviceStatus] = await Promise.all([
    canReviewPireps ? listAllPireps().catch(() => null) : Promise.resolve(null),
    canViewSupport ? listAllTickets().catch(() => null) : Promise.resolve(null),
    canManageMentoring ? listMentorApplications().catch(() => null) : Promise.resolve(null),
    canManageMentoring ? listMentoringFlightReviews().catch(() => null) : Promise.resolve(null),
    canViewFleet ? listFleetAircraft().catch(() => null) : Promise.resolve(null),
    canViewLiveOperations ? listLiveAcarsSessions().catch(() => null) : Promise.resolve(null),
    canManageClosedBeta ? listPilots().catch(() => null) : Promise.resolve(null),
    canViewServiceStatus ? getServiceStatusState().catch(() => null) : Promise.resolve(null),
  ]);

  const items: InboxItem[] = [];

  if (pireps) {
    const pending = pireps.filter((pirep) => pirep.status === "pending").length;
    const awaitingPilot = pireps.filter((pirep) => pirep.status === "changes_requested").length;
    items.push({
      id: "pireps",
      icon: "✈",
      count: pending,
      title: "PIREP reviews",
      detail: pending
        ? `${pending} ready for review${awaitingPilot ? ` · ${awaitingPilot} with pilots` : ""}`
        : awaitingPilot ? `${awaitingPilot} awaiting pilot response` : "No reports waiting",
      href: "/staff/pireps",
      tone: pending ? "attention" : "clear",
    });
  }

  if (tickets) {
    const active = tickets.filter((ticket) => ticket.status === "open" || ticket.status === "in_progress");
    const urgent = active.filter((ticket) => ticket.priority === "urgent").length;
    const unassigned = active.filter((ticket) => !ticket.assignedStaffId).length;
    items.push({
      id: "tickets",
      icon: "✉",
      count: active.length,
      title: "Pilot support",
      detail: active.length ? `${unassigned} unassigned${urgent ? ` · ${urgent} urgent` : ""}` : "No active tickets",
      href: "/staff/tickets?status=open",
      tone: urgent ? "urgent" : active.length ? "attention" : "clear",
    });
  }

  if (mentorApplications && mentoringReviews) {
    const applications = mentorApplications.filter((application) => application.status === "pending").length;
    const reviews = mentoringReviews.filter((review) => review.staffReviewedAt === null).length;
    const total = applications + reviews;
    items.push({
      id: "mentoring",
      icon: "◎",
      count: total,
      title: "Mentoring review",
      detail: total ? `${applications} applications · ${reviews} flight reviews` : "No mentoring actions due",
      href: "/staff/mentoring",
      tone: total ? "attention" : "clear",
    });
  }

  if (fleet) {
    const notDispatchable = fleet.filter((aircraft) => !isFleetAircraftBookable(aircraft));
    const grounded = notDispatchable.filter((aircraft) => aircraft.dispatchStatus === "grounded" || aircraft.operationalStatus === "grounded").length;
    items.push({
      id: "fleet",
      icon: "▤",
      count: notDispatchable.length,
      title: "Fleet control",
      detail: notDispatchable.length ? `${grounded} grounded · check technical records` : "All aircraft dispatchable",
      href: "/staff/fleet",
      tone: grounded ? "urgent" : notDispatchable.length ? "attention" : "clear",
    });
  }

  if (sessions) {
    const stale = sessions.filter((session) => !session.connectionHealthy).length;
    items.push({
      id: "ember",
      icon: "◉",
      count: sessions.length,
      title: "Ember live flights",
      detail: sessions.length ? `${sessions.length - stale} healthy${stale ? ` · ${stale} stale` : ""}` : "No live Ember flights",
      href: "/staff/live-operations",
      tone: stale ? "attention" : "clear",
    });
  }

  if (pilots) {
    const waitingForActivation = pilots.filter((pilot) => pilot.betaAccess && pilot.mustChangePassword).length;
    items.push({
      id: "beta",
      icon: "◇",
      count: waitingForActivation,
      title: "Beta access",
      detail: waitingForActivation ? "Invited pilots have not changed their temporary password" : "All invited pilots activated",
      href: "/staff/permissions",
      tone: waitingForActivation ? "attention" : "clear",
    });
  }

  if (!items.length) return null;

  const outstanding = items.reduce((total, item) => total + item.count, 0);
  const overall = serviceStatus ? overallServiceStatus(serviceStatus) : null;

  return (
    <section className="staff-operations-inbox staff-operations-inbox-embedded" aria-labelledby="staff-operations-inbox-title">
      <div className="staff-operations-inbox-heading">
        <span className="staff-operations-inbox-icon" aria-hidden="true">◉</span>
        <div>
          <span>Today&apos;s operations queue</span>
          <h2 id="staff-operations-inbox-title">{outstanding ? `${outstanding} ${outstanding === 1 ? "item needs" : "items need"} attention` : "All caught up"}</h2>
        </div>
        <small>Live when you open Staff Centre</small>
      </div>
      <div className="staff-operations-inbox-items">
        {items.map((item) => (
          <Link className={`staff-operations-inbox-item ${item.tone}`} href={item.href} key={item.id}>
            <span className="staff-operations-inbox-item-icon" aria-hidden="true">{item.icon}</span>
            <span className="staff-operations-inbox-count">{item.count}</span>
            <span className="staff-operations-inbox-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
            <span className="staff-operations-inbox-arrow" aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
      <footer className="staff-operations-inbox-footer">
        <span><b>●</b> {activeStaffCount} authorised staff account{activeStaffCount === 1 ? "" : "s"}</span>
        {overall ? <Link className={overall.state === "operational" ? "clear" : "attention"} href="/staff/service-status"><b>●</b> {serviceStateLabel(overall.state)}</Link> : <span><b>○</b> System status restricted</span>}
      </footer>
    </section>
  );
}
