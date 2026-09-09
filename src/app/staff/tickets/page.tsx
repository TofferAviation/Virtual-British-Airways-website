import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { requireStaffPermission } from "@/lib/staff-auth";
import { listAllTickets } from "@/lib/ticket-store";

export const metadata = { title: "Ticket Centre" };

export default async function StaffTicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireStaffPermission("support.view");
  const params = await searchParams;
  const filter = typeof params.status === "string" ? params.status : "all";
  const tickets = await listAllTickets();
  const filtered = filter === "all" ? tickets : tickets.filter((ticket) => ticket.status === filter);
  const counts = {
    open: tickets.filter((ticket) => ticket.status === "open").length,
    progress: tickets.filter((ticket) => ticket.status === "in_progress").length,
    waiting: tickets.filter((ticket) => ticket.status === "waiting_for_pilot").length,
    urgent: tickets.filter((ticket) => ticket.priority === "urgent" && ticket.status !== "closed").length,
  };

  return <>
    <SiteHeader />
    <main className="ticket-page ticket-staff-page">
      <section className="ticket-hero"><div className="ticket-shell"><span className="ticket-kicker">Staff Centre</span><h1>Ticket Centre</h1><p>Review pilot support requests, assign ownership and manage the full support conversation.</p></div></section>
      <section className="ticket-shell ticket-stats-grid">
        <Link href="/staff/tickets?status=open"><strong>{counts.open}</strong><span>Open</span></Link>
        <Link href="/staff/tickets?status=in_progress"><strong>{counts.progress}</strong><span>In progress</span></Link>
        <Link href="/staff/tickets?status=waiting_for_pilot"><strong>{counts.waiting}</strong><span>Waiting for pilot</span></Link>
        <Link href="/staff/tickets"><strong>{counts.urgent}</strong><span>Urgent</span></Link>
      </section>
      <section className="ticket-shell ticket-list-panel">
        <div className="ticket-panel-heading"><div><span className="ticket-kicker">Support inbox</span><h2>{filter === "all" ? "All tickets" : filter.replaceAll("_", " ")}</h2></div><div className="ticket-heading-actions"><Link href="/staff">Staff Centre</Link><Link href="/staff/tickets">Clear filter</Link></div></div>
        {filtered.length ? <div className="ticket-list staff">
          {filtered.map((ticket) => <Link className="ticket-row" href={`/staff/tickets/${ticket.id}`} key={ticket.id}>
            <div><strong>{ticket.number}</strong><span>{ticket.subject}</span><small>{ticket.pilotName} · {ticket.pilotId}</small></div>
            <span className={`ticket-status ticket-status-${ticket.status}`}>{ticket.status.replaceAll("_", " ")}</span>
            <span className={`ticket-priority ticket-priority-${ticket.priority}`}>{ticket.priority}</span>
            <span>{ticket.assignedStaffName ?? "Unassigned"}</span>
            <time>{new Date(ticket.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</time>
            <b>›</b>
          </Link>)}
        </div> : <div className="ticket-empty"><h3>No tickets match this view</h3><p>Try another status filter or return to all support tickets.</p></div>}
      </section>
    </main>
  </>;
}
