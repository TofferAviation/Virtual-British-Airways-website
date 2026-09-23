import Link from "next/link";
import { listAllPireps } from "@/lib/pilot-operations-store";
import { listAllPilotHourTransferRequests } from "@/lib/pilot-store";
import { listAllTickets } from "@/lib/ticket-store";

type StaffOperationsInboxProps = {
  canReviewPireps: boolean;
  canReviewTransfers: boolean;
  canViewSupport: boolean;
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
 * A permission-aware operational inbox for the Staff Centre landing page.
 * Each staff member sees only queues they are already permitted to open.
 */
export async function StaffOperationsInbox({
  canReviewPireps,
  canReviewTransfers,
  canViewSupport,
}: StaffOperationsInboxProps) {
  const [pireps, transferRequests, tickets] = await Promise.all([
    canReviewPireps ? listAllPireps().catch(() => null) : Promise.resolve(null),
    canReviewTransfers ? listAllPilotHourTransferRequests().catch(() => null) : Promise.resolve(null),
    canViewSupport ? listAllTickets().catch(() => null) : Promise.resolve(null),
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
        ? `${pending} flight ${pending === 1 ? "report" : "reports"} ready for review${awaitingPilot ? ` · ${awaitingPilot} awaiting pilot response` : ""}`
        : awaitingPilot
          ? `No reviews due · ${awaitingPilot} awaiting pilot response`
          : "No flight reports waiting for review",
      href: "/staff/pireps",
      tone: pending ? "attention" : "clear",
    });
  }

  if (transferRequests) {
    const pending = transferRequests.filter((request) => request.status === "pending").length;
    items.push({
      id: "transfers",
      icon: "↟",
      count: pending,
      title: "Transfer credit",
      detail: pending
        ? `${pending} former-VA ${pending === 1 ? "request" : "requests"} awaiting a decision`
        : "No transfer-credit requests waiting",
      href: "/staff/hour-transfers",
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
      title: "Support inbox",
      detail: active.length
        ? `${active.length} active · ${unassigned} unassigned${urgent ? ` · ${urgent} urgent` : ""}`
        : "No active support tickets",
      href: "/staff/tickets?status=open",
      tone: urgent ? "urgent" : active.length ? "attention" : "clear",
    });
  }

  if (!items.length) return null;

  const outstanding = items.reduce((total, item) => total + item.count, 0);

  return (
    <section className="staff-shell staff-operations-inbox" aria-labelledby="staff-operations-inbox-title">
      <div className="staff-operations-inbox-heading">
        <span className="staff-operations-inbox-icon" aria-hidden="true">◉</span>
        <div>
          <span>Staff operations inbox</span>
          <h2 id="staff-operations-inbox-title">
            {outstanding ? `${outstanding} ${outstanding === 1 ? "item needs" : "items need"} attention` : "All caught up"}
          </h2>
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
    </section>
  );
}
