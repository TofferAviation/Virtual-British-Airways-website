import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { requirePilotSession } from "@/lib/pilot-auth";
import { createPilotTicket } from "../actions";

export const metadata = { title: "Open support ticket" };

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePilotSession();
  const params = await searchParams;
  const hasError = params.error === "required";

  return <>
    <SiteHeader />
    <main className="ticket-page">
      <section className="ticket-hero compact"><div className="ticket-shell"><span className="ticket-kicker">Pilot support</span><h1>Open a support ticket</h1><p>Tell us what you need help with and the support team can reply directly in your ticket.</p></div></section>
      <section className="ticket-shell ticket-form-shell"><div className="ticket-form-card"><div className="ticket-panel-heading"><div><span className="ticket-kicker">New request</span><h2>How can we help?</h2></div><Link href="/support/tickets">Your tickets →</Link></div>{hasError ? <p className="ticket-error">Please add both a subject and a message.</p> : null}<form action={createPilotTicket} className="ticket-form"><div className="ticket-form-grid"><label><span>Category</span><select name="category" defaultValue="technical"><option value="account">Account & login</option><option value="flight">Flights & PIREPs</option><option value="website">Website</option><option value="events">Events</option><option value="technical">Technical issue</option><option value="other">Other</option></select></label><label><span>Subject</span><input name="subject" maxLength={120} required placeholder="Short summary of the issue" /></label></div><label><span>Message</span><textarea name="message" rows={9} maxLength={8000} required placeholder="Describe what happened, what you expected, and any steps we can use to reproduce it." /></label><label><span>Attachments <small>(optional · up to 5 files, 8 MB each)</small></span><input name="attachments" type="file" multiple accept="image/*,.txt,.log,.pdf" /></label><div className="ticket-form-actions"><Link className="ticket-secondary" href="/support/tickets">Cancel</Link><button className="ticket-primary" type="submit">Create ticket</button></div></form></div></section>
    </main>
    <SiteFooter />
  </>;
}
