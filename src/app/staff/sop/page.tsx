import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff Centre SOP",
  description: "The British Airways Virtual Staff Centre Standard Operating Procedure.",
};

const procedures = [
  {
    number: "01",
    title: "Start every shift from the live record",
    copy: "Sign in to Staff Centre using your own staff account. Check Service Status, the PIREP queue, support tickets, fleet availability and Live Operations before making any operational decision. Work only from the current BAV record—not screenshots, DMs or assumptions.",
    links: [["Service status", "/staff/service-status"], ["PIREP Centre", "/staff/pireps"], ["Live Operations", "/staff/live-operations"]],
  },
  {
    number: "02",
    title: "Stay inside your assigned authority",
    copy: "Your Staff Centre role and permissions define what you may manage. Do not borrow another person’s account, share a password, change a role to bypass a restriction, or access protected service settings unless that responsibility has been explicitly assigned to you.",
    links: [["User permissions", "/staff/permissions"], ["Staff profile", "/staff/profile"]],
  },
  {
    number: "03",
    title: "Review PIREPs consistently",
    copy: "Accept a PIREP only when its route, aircraft, timing and supporting flight record are credible. Acceptance applies VA Points, Tier Points, career achievements and the related fleet credit. Request changes when clarification is possible; reject only with a clear staff comment that explains why.",
    links: [["Open PIREP Centre", "/staff/pireps"]],
  },
  {
    number: "04",
    title: "Protect pilots and their careers",
    copy: "Use Pilot Management to look up the live BAV account before helping with a hub, rank, type rating or account-status question. Never disclose account data to another pilot. Suspend an account only where there is an approved operational or safeguarding reason, and leave a clear internal record.",
    links: [["Pilot Management", "/staff/pilots"]],
  },
  {
    number: "05",
    title: "Keep fleet decisions operational",
    copy: "Use Fleet Management for aircraft condition, dispatch availability, defects and maintenance. Do not make an aircraft dispatchable merely to solve a booking issue. Confirm the actual technical and operational status first, because a reservation and a completed flight feed the airframe’s hours, cycles, station and logbook.",
    links: [["Fleet Management", "/staff/fleet"]],
  },
  {
    number: "06",
    title: "Publish events only when ready",
    copy: "An event must have a clear title, UTC window, published route, pilot-facing description and its reward settings before publication. Preview the public Events page after publishing. Event badges and bonuses are awarded only when an accepted PIREP matches the event’s published date and primary route.",
    links: [["Staff Centre events", "/staff"], ["Public Events", "/events"]],
  },
  {
    number: "07",
    title: "Resolve support professionally",
    copy: "Keep each ticket focused on the pilot’s actual issue. Never ask for passwords, API keys, cookies or device-session values. Use plain explanations, state the next action, and close a ticket only after the pilot has a workable outcome or a clear reason why more information is needed.",
    links: [["Ticket Centre", "/staff/tickets"]],
  },
  {
    number: "08",
    title: "Escalate and hand over clearly",
    copy: "If you suspect an account compromise, data issue, incorrect production behaviour or a public-safety problem, stop making changes, record what you observed and escalate to an administrator. At the end of a shift, leave any open ticket, PIREP, fleet defect or incident with a concise status and named next owner.",
    links: [["Service status", "/staff/service-status"], ["Staff Centre", "/staff"]],
  },
] as const;

export default async function StaffSopPage() {
  const session = await requireStaffSession();

  return (
    <>
      <SiteHeader />
      <main className="staff-sop-page">
        <section className="staff-sop-hero">
          <div className="staff-sop-shell">
            <nav className="staff-sop-breadcrumbs" aria-label="Breadcrumb"><Link href="/staff">Staff Centre</Link><span>›</span><strong>Standard Operating Procedure</strong></nav>
            <div className="staff-sop-hero-grid">
              <div>
                <span className="staff-sop-kicker">British Airways Virtual · Staff Centre</span>
                <h1>Standard Operating Procedure</h1>
                <p>The working guide for authorised BAV staff. It sets a consistent, secure way to operate the airline, support pilots and hand work safely to the next person.</p>
                <div className="staff-sop-actions"><a href="#procedures">Read procedures</a><Link href="/staff">Open Staff Centre →</Link></div>
              </div>
              <aside className="staff-sop-control-card"><span>Document control</span><strong>Staff Operations SOP</strong><dl><div><dt>Status</dt><dd>Active</dd></div><div><dt>Audience</dt><dd>Authorised staff</dd></div><div><dt>Signed in as</dt><dd>{session.name}</dd></div></dl></aside>
            </div>
          </div>
        </section>

        <section className="staff-sop-shell staff-sop-intro">
          <div><span className="staff-sop-kicker">How to use this SOP</span><h2>One standard, applied with judgement.</h2></div>
          <p>Follow the relevant procedure before changing an operational record. If a task is outside your permissions or this guide does not give you a safe answer, pause and escalate rather than improvising.</p>
        </section>

        <section className="staff-sop-shell staff-sop-principles" aria-label="Operating principles">
          <article><span>01</span><strong>Accurate</strong><p>Use the live BAV record and leave clear staff comments.</p></article>
          <article><span>02</span><strong>Secure</strong><p>Protect pilot data, credentials and access boundaries.</p></article>
          <article><span>03</span><strong>Fair</strong><p>Apply the same evidence-led standard to every pilot.</p></article>
          <article><span>04</span><strong>Traceable</strong><p>Make decisions that the next staff member can understand.</p></article>
        </section>

        <section className="staff-sop-shell staff-sop-procedures" id="procedures">
          <div className="staff-sop-section-heading"><span className="staff-sop-kicker">Operational procedures</span><h2>Run the airline with confidence.</h2><p>These procedures cover normal staff work. Administrator-only infrastructure, production credentials, backups and emergency recovery remain in the private administrator runbook.</p></div>
          <div className="staff-sop-procedure-list">
            {procedures.map((procedure) => <article key={procedure.number}>
              <span className="staff-sop-number">{procedure.number}</span>
              <div><h3>{procedure.title}</h3><p>{procedure.copy}</p><div className="staff-sop-links">{procedure.links.map(([label, href]) => <Link key={href} href={href}>{label} →</Link>)}</div></div>
            </article>)}
          </div>
        </section>

        <section className="staff-sop-shell staff-sop-escalation">
          <div><span className="staff-sop-kicker">Non-negotiable</span><h2>Stop and escalate when security or data may be at risk.</h2></div>
          <div><p>Do not make a speculative fix in production. Capture the affected account, screen or operational record; note the time and what you observed; then contact an administrator through the approved internal channel.</p><Link href="/staff/service-status">Check service status →</Link></div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
