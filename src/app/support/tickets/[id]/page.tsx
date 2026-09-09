import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getTicket } from "@/lib/ticket-store";
import { replyToPilotTicket } from "../actions";

export default async function PilotTicketDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePilotSession();
  const { id } = await params;
  const ticket = await getTicket(id);
  if (!ticket || ticket.pilotId !== session.pilotId) notFound();
  const visibleMessages = ticket.messages.filter((message) => !message.internal);
  const replyAction = replyToPilotTicket.bind(null, ticket.id);

  return <>
    <SiteHeader />
    <main className="ticket-page">
      <section className="ticket-hero compact"><div className="ticket-shell"><span className="ticket-kicker">{ticket.number}</span><h1>{ticket.subject}</h1><div className="ticket-meta-line"><span className={`ticket-status ticket-status-${ticket.status}`}>{ticket.status.replaceAll("_", " ")}</span><span className={`ticket-priority ticket-priority-${ticket.priority}`}>{ticket.priority}</span><span>{ticket.category}</span></div></div></section>
      <section className="ticket-shell ticket-detail-grid">
        <div className="ticket-thread-card"><div className="ticket-panel-heading"><div><span className="ticket-kicker">Conversation</span><h2>Support thread</h2></div><Link href="/support/tickets">All tickets →</Link></div><div className="ticket-thread">{visibleMessages.map((message) => <article className={`ticket-message ${message.authorType}`} key={message.id}><header><div><strong>{message.authorName}</strong><span>{message.authorType === "staff" ? "BAV Staff" : session.pilotNumber}</span></div><time>{new Date(message.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</time></header><p>{message.body}</p>{message.attachments.length ? <div className="ticket-attachments">{message.attachments.map((attachment) => <a href={attachment.href} target="_blank" rel="noreferrer" key={attachment.id}>📎 {attachment.name}</a>)}</div> : null}</article>)}</div>{ticket.status !== "closed" ? <form action={replyAction} className="ticket-reply-form"><label><span>Reply</span><textarea name="message" rows={5} maxLength={8000} required placeholder="Write your reply…" /></label><label><span>Add attachments <small>(optional)</small></span><input type="file" name="attachments" multiple accept="image/*,.txt,.log,.pdf" /></label><div className="ticket-form-actions"><button className="ticket-primary" type="submit">Send reply</button></div></form> : <div className="ticket-closed-note">This ticket is closed. Open a new ticket if you need further help.</div>}</div>
        <aside className="ticket-side-card"><h3>Ticket details</h3><dl><div><dt>Ticket</dt><dd>{ticket.number}</dd></div><div><dt>Category</dt><dd>{ticket.category}</dd></div><div><dt>Priority</dt><dd>{ticket.priority}</dd></div><div><dt>Status</dt><dd>{ticket.status.replaceAll("_", " ")}</dd></div><div><dt>Assigned to</dt><dd>{ticket.assignedStaffName ?? "Support queue"}</dd></div><div><dt>Created</dt><dd>{new Date(ticket.createdAt).toLocaleDateString("en-GB")}</dd></div></dl></aside>
      </section>
    </main>
    <SiteFooter />
  </>;
}
