import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { requireStaffPermission } from "@/lib/staff-auth";
import { getStaffState } from "@/lib/staff-store";
import { getTicket } from "@/lib/ticket-store";
import { staffReplyToTicket, updateStaffTicket } from "../actions";

export default async function StaffTicketDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPermission("support.view");
  const { id } = await params;
  const ticket = await getTicket(id);
  if (!ticket) notFound();
  const staffState = await getStaffState();
  const activeStaff = staffState.users.filter((user) => user.status === "active");
  const replyAction = staffReplyToTicket.bind(null, ticket.id);
  const updateAction = updateStaffTicket.bind(null, ticket.id);

  return <>
    <SiteHeader />
    <main className="ticket-page ticket-staff-page">
      <section className="ticket-hero compact"><div className="ticket-shell"><span className="ticket-kicker">{ticket.number} · {ticket.pilotId}</span><h1>{ticket.subject}</h1><div className="ticket-meta-line"><span className={`ticket-status ticket-status-${ticket.status}`}>{ticket.status.replaceAll("_", " ")}</span><span className={`ticket-priority ticket-priority-${ticket.priority}`}>{ticket.priority}</span><span>{ticket.category}</span></div></div></section>
      <section className="ticket-shell ticket-detail-grid staff-detail">
        <div className="ticket-thread-card">
          <div className="ticket-panel-heading"><div><span className="ticket-kicker">Support conversation</span><h2>{ticket.pilotName}</h2></div><Link href="/staff/tickets">Ticket Centre →</Link></div>
          <div className="ticket-thread">
            {ticket.messages.map((message) => <article className={`ticket-message ${message.authorType}${message.internal ? " internal" : ""}`} key={message.id}>
              <header><div><strong>{message.authorName}</strong><span>{message.internal ? "Internal note" : message.authorType === "staff" ? "BAV Staff" : ticket.pilotId}</span></div><time>{new Date(message.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</time></header>
              <p>{message.body}</p>
              {message.attachments.length ? <div className="ticket-attachments">{message.attachments.map((attachment) => <a href={attachment.href} target="_blank" rel="noreferrer" key={attachment.id}>📎 {attachment.name}</a>)}</div> : null}
            </article>)}
          </div>
          <form action={replyAction} className="ticket-reply-form"><label><span>Reply or internal note</span><textarea name="message" rows={5} maxLength={8000} required placeholder="Write a response for the pilot, or mark it as an internal staff note below." /></label><label><span>Add attachments</span><input type="file" name="attachments" multiple accept="image/*,.txt,.log,.pdf" /></label><label className="ticket-check"><input type="checkbox" name="internal" /> <span>Internal note — hidden from the pilot</span></label><div className="ticket-form-actions"><button className="ticket-primary" type="submit">Add message</button></div></form>
        </div>
        <aside className="ticket-side-stack">
          <form action={updateAction} className="ticket-side-card ticket-manage-form">
            <h3>Manage ticket</h3>
            <label><span>Status</span><select name="status" defaultValue={ticket.status}><option value="open">Open</option><option value="in_progress">In progress</option><option value="waiting_for_pilot">Waiting for pilot</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></label>
            <label><span>Priority</span><select name="priority" defaultValue={ticket.priority}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
            <label><span>Assigned staff</span><select name="assignedStaffId" defaultValue={ticket.assignedStaffId ?? ""}><option value="">Support queue</option>{activeStaff.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}</select></label>
            <input type="hidden" name="assignedStaffName" value="" />
            <button className="ticket-primary" type="submit">Save changes</button>
          </form>
          <div className="ticket-side-card"><h3>Pilot details</h3><dl><div><dt>Name</dt><dd>{ticket.pilotName}</dd></div><div><dt>Pilot ID</dt><dd>{ticket.pilotId}</dd></div><div><dt>Category</dt><dd>{ticket.category}</dd></div><div><dt>Created</dt><dd>{new Date(ticket.createdAt).toLocaleString("en-GB")}</dd></div><div><dt>Updated</dt><dd>{new Date(ticket.updatedAt).toLocaleString("en-GB")}</dd></div></dl></div>
        </aside>
      </section>
    </main>
  </>;
}
