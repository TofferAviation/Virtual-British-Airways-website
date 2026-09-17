import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Handbook",
  description: "The British Airways Virtual handbook for pilots and Staff Centre operations.",
};

const pilotSteps = [
  ["01", "Create and secure your pilot account", "Use your BAV account for the website and keep your profile, password and SimBrief Pilot ID current."],
  ["02", "Choose your virtual service", "Browse the schedule, reserve a service and use Manage Assignment to keep its briefing available."],
  ["03", "Reserve an aircraft registration", "In Ember Fleet Management, select a dispatchable registration matching your BAV flight and reserve it. Other pilots cannot take that airframe while it is assigned to you."],
  ["04", "Plan, fly and credit the airframe", "Generate and sync your SimBrief OFP, then fly with Ember. Completing the flight updates the aircraft’s hours, cycle, station and fleet logbook before you submit your PIREP."],
];

const staffSteps = [
  ["01", "Activate Staff Centre access", "Use the invitation sent to your staff email to set a separate Staff Centre password. It does not change your pilot password."],
  ["02", "Understand your role", "Your role and individual permissions determine which operational tools you can access. Only use systems assigned to you."],
  ["03", "Work from the live record", "Manage pilots, registrations, fleet logbooks, routes, tickets, PIREPs and news from the Staff Centre so the whole team sees the same information."],
  ["04", "Keep operations secure", "Never share credentials, avoid exporting personal data and escalate an access or system issue to an administrator promptly."],
];

const pilotChecklist = [
  ["1", "Sign in and prepare your profile", "Open Account Settings and confirm your name, email and SimBrief Pilot ID. Ember uses the same BAV pilot account; it never needs your SimBrief password."],
  ["2", "Book a BAV service", "Use Book to choose an available flight. Once saved, open Manage Assignment and verify that the flight number, route and aircraft are correct."],
  ["3", "Generate and sync the flight plan", "From Manage Assignment, generate your official SimBrief plan, complete SimBrief’s sign-in window, then use Sync generated plan. The OFP details stay available on your BAV assignment."],
  ["4", "Open Ember and refresh BAV flight", "Sign in to Ember with the same BAV email and password, then use Refresh BAV flight and profile. Ember should show the flight you selected on the website."],
  ["5", "Reserve the registration", "Open Fleet Management, choose a dispatchable registration and select Reserve for flight. Wait for Ember to confirm the reservation. That specific airframe is now yours for this service."],
  ["6", "Start the simulator and confirm tracking", "Connect the simulator, then start the engines or begin pushback. Ember starts the ACARS session and BA-Radar should show the live flight after its normal refresh interval."],
  ["7", "Complete the flight cleanly", "After arrival, stop the aircraft and shut down the engines. Keep Ember open briefly while it completes the active assignment, then submit the PIREP. The reserved airframe’s hours, cycles, station and logbook are retained for the next pilot and Staff Centre."],
];

export default function HandbookPage() {
  return (
    <>
      <SiteHeader />
      <main className="handbook-page">
        <section className="handbook-hero">
          <div className="handbook-shell handbook-hero-inner">
            <div className="handbook-brand-lockup">
              <BrandLogo variant="white" priority />
              <span>Handbook</span>
            </div>
            <div className="handbook-hero-copy">
              <span className="handbook-kicker">British Airways Virtual</span>
              <h1>Your guide to flying and operating with BAV.</h1>
              <p>A living handbook for pilots and authorised staff. It is updated with every meaningful British Airways Virtual website and Ember release.</p>
              <div className="handbook-hero-actions"><a href="#pilot-checklist">Pilot checklist</a><a href="#staff">Staff operations</a><a href="#ember">Ember ACARS</a></div>
            </div>
            <aside className="handbook-release-note"><span>Living documentation</span><strong>Built into every release</strong><p>New procedures, screenshots and troubleshooting guidance are updated when the relevant BAV system changes.</p></aside>
          </div>
        </section>

        <section className="handbook-shell handbook-intro">
          <div><span className="handbook-kicker">Start here</span><h2>One handbook, clear paths.</h2></div>
          <p>Choose the guide that matches what you need to do today. The public pilot guidance is open to everyone; Staff Centre procedures explain authorised operational work without exposing administrator-only infrastructure details.</p>
        </section>

        <section className="handbook-shell handbook-path-grid" aria-label="Handbook paths">
          <a className="handbook-path-card" href="#pilot"><span aria-hidden="true">✈</span><div><strong>Flying with BAV</strong><small>Account, bookings, SimBrief, flight plans, Ember and PIREPs.</small></div><b aria-hidden="true">→</b></a>
          <a className="handbook-path-card" href="#staff"><span aria-hidden="true">◈</span><div><strong>Staff Centre operations</strong><small>Onboarding, roles, permissions and the team’s core operational procedures.</small></div><b aria-hidden="true">→</b></a>
          <a className="handbook-path-card" href="#ember"><span aria-hidden="true">◉</span><div><strong>Ember ACARS</strong><small>Secure account connection, aircraft selection, telemetry and BA-Radar.</small></div><b aria-hidden="true">→</b></a>
        </section>

        <section className="handbook-shell handbook-guide" id="pilot">
          <div className="handbook-guide-heading"><span className="handbook-kicker">Pilot handbook</span><h2>From account creation to your first completed flight.</h2><p>Use these steps in sequence if you are new to British Airways Virtual, or jump directly to the relevant area from your pilot account.</p><Link href="/account">Open pilot account →</Link></div>
          <div className="handbook-step-grid">{pilotSteps.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
        </section>

        <section className="handbook-shell handbook-self-service" id="pilot-checklist">
          <div className="handbook-self-service-heading"><div><span className="handbook-kicker">Pilot self-service guide</span><h2>Complete a BAV flight without needing support.</h2><p>Follow this exact order. Each stage confirms that the previous one is working before you continue.</p></div><div className="handbook-self-service-links"><Link href="/book">Book a flight</Link><Link href="/manage-assignment">Manage assignment</Link><Link href="/account/profile">Account settings</Link></div></div>
          <ol className="handbook-checklist">{pilotChecklist.map(([number, title, copy]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></li>)}</ol>
          <div className="handbook-self-check"><strong>Before opening a support ticket</strong><div><p><b>No flight in Ember?</b> Confirm the BAV flight is booked, then use Refresh BAV flight and profile.</p><p><b>Cannot reserve a registration?</b> Select another aircraft marked dispatchable; the chosen one may already be reserved or unavailable.</p><p><b>No flight on BA-Radar?</b> Check that Ember is signed in, the simulator is connected and you have started engines or pushback on an active BAV assignment.</p></div></div>
        </section>

        <section className="handbook-shell handbook-guide handbook-staff-guide" id="staff">
          <div className="handbook-guide-heading"><span className="handbook-kicker">Staff Centre Operations Handbook</span><h2>Welcome to British Airways Virtual Staff Centre.</h2><p>This is the starting point for new staff members. Staff access is separate from a BAV pilot account and each role only exposes the tools needed for its responsibility.</p><Link href="/staff">Open Staff Centre →</Link></div>
          <div className="handbook-step-grid">{staffSteps.map(([number, title, copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
          <div className="handbook-staff-note"><strong>Administrator information stays protected.</strong><span>Production configuration, deployment, Supabase, DNS and recovery procedures belong in the private administrator runbook—not in this public handbook.</span></div>
        </section>

        <section className="handbook-shell handbook-ember" id="ember">
          <div className="handbook-ember-mark"><Image src="/branding/ember-systems-logo.png" alt="Ember Systems" width={512} height={512} priority /></div>
          <div><span className="handbook-kicker">Ember ACARS Systems</span><h2>Your connected BAV flight desk.</h2><p>After signing in with your BAV pilot account, Ember can refresh your selected flight, retrieve the matching airframe, connect simulator telemetry and send live position updates to BA-Radar.</p><div className="handbook-ember-lifecycle"><article><strong>Reserve</strong><span>Choose a dispatchable registration for your BAV service. The reservation keeps that airframe exclusively assigned to you.</span></article><article><strong>Operate</strong><span>At engine start or pushback, Ember begins the active ACARS and fleet operation for your reserved aircraft.</span></article><article><strong>Record</strong><span>When the flight is completed, aircraft hours, cycle, station and fleet logbook history are permanently updated for staff and future pilots.</span></article></div><div className="handbook-ember-links"><Link href="/account/profile">View Ember access in Account Settings →</Link><Link href="/ba-radar">Open BA-Radar →</Link></div></div>
        </section>

        <section className="handbook-shell handbook-support">
          <div><span className="handbook-kicker">Need help?</span><h2>Use the right channel.</h2><p>Check this handbook first, then open a private support ticket for account or operational help. Staff should raise security and access issues with an administrator immediately.</p></div>
          <div><Link className="handbook-primary-link" href="/support/tickets/new">Open a support ticket</Link><Link className="handbook-secondary-link" href="/service-status">Service status</Link></div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
