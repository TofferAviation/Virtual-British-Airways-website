import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { pilot } from "@/lib/mockData";
import { listPilotTickets } from "@/lib/ticket-store";

export const metadata = { title: "Support tickets" };

export default async function PilotTicketsPage() {
  const store = await cookies();
  if (store.get("bav_demo_session")?.value !== "1") redirect("/login");
  const tickets = await listPilotTickets(pilot.id);
  const openCount = tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)).length;

  return <>
    <SiteHeader />
    <main className="ticket-page">
      <section className="ticket-hero"><div className="ticket-shell"><span className="ticket-kicker">Pilot support</span><h1>Your support tickets</h1><p>Contact the British Airways Virtual team, follow replies and keep your support history in one place.</p></div></section>
      <section className="ticket-shell ticket-toolbar">
        <div><strong>{openCount}</strong><span>Active tickets</span></div>
        <div><strong>{tickets.length}</strong><span>Total tickets</span></div>
        <Link className="ticket-primary" href="/support/tickets/new">Open a new ticket</Link>
      </section>
      <section className="ticket-shell ticket-list-panel">
        <div className="ticket-panel-heading"><div><span className="ticket-kicker">Support history</span><h2>Tickets</h2></div><Link href="/help">Help centre →</Link></div>
        {tickets.length ? <div className="ticket-list">
          {tickets.map((ticket) => <Link className="ticket-row" href={`/support/tickets/${ticket.id}`} key={ticket.id}>
            <div><strong>{ticket.number}</strong><span>{ticket.subject}</span></div>
            <span className={`ticket-status ticket-status-${ticket.status}`}>{ticket.status.replaceAll("_", " ")}</span>
            <span className={`ticket-priority ticket-priority-${ticket.priority}`}>{ticket.priority}</span>
            <time>{new Date(ticket.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</time>
            <b>›</b>
          </Link>)}
        </div> : <div className="ticket-empty"><h3>No support tickets yet</h3><p>When you need help, open a ticket and the conversation will appear here.</p><Link className="ticket-primary" href="/support/tickets/new">Open your first ticket</Link></div>}
      </section>
    </main>
    <SiteFooter />
  </>;
}
