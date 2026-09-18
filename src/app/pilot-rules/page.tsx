import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { PILOT_RULES_TITLE, PILOT_RULES_VERSION } from "@/lib/pilot-rules";

export const metadata = {
  title: "Pilot Rules",
  description: "British Airways Virtual Pilot Rules and Operational Standards.",
};

const rules = [
  ["01", "Purpose and independence", "British Airways Virtual (BAV) is an independent flight-simulation community. It is not British Airways plc, does not sell or manage real airline travel, and does not provide real-world passenger services. Use BAV only for its intended virtual-airline and simulator purpose."],
  ["02", "Pilot account and security", "Keep your account details accurate, use one account for yourself, and keep your password, session and Ember device access private. Do not share, buy, sell, transfer, impersonate or attempt to access another pilot’s account."],
  ["03", "Community conduct", "Treat pilots, staff and community members respectfully. Harassment, hate speech, threats, bullying, doxxing, spam, deliberate disruption and staff impersonation are not permitted in BAV services or associated community spaces."],
  ["04", "Bookings and assignments", "Reserve a BAV service only when you genuinely intend to operate it. Review the selected flight in Manage Assignment before departure. If you cannot fly, cancel or replace the active assignment so another pilot can use the available schedule capacity."],
  ["05", "Hubs, schedules and flight planning", "Use the BAV schedule as an in-house virtual operation. Your home hub guides the flights shown to you, but it is not a real-world airline timetable. Generate and sync a SimBrief plan only for your own selected BAV assignment; BAV never requires or stores your SimBrief password."],
  ["06", "Flight-deck progression and aircraft qualifications", "Cadets begin on regional and A320-family flying. A321 services unlock at Second Officer rank. A350, Boeing 777 and Boeing 787 services require Senior First Officer rank or above plus the relevant staff-approved type rating. When using Ember, reserve a dispatchable registration that matches your selected service; aircraft hours, cycles, station and fleet logbook must reflect a genuine BAV flight."],
  ["07", "Ember ACARS and BA-Radar", "Use Ember telemetry only with your own active BAV assignment and a real supported simulator session. Do not falsify, replay, inject, manipulate or automate position data, engine state, fuel, landing rate, flight time, distance or other operational data to gain an advantage."],
  ["08", "PIREPs, hours and pilot progression", "A completed Ember flight creates a linked PIREP for staff review. Submit a manual PIREP only if the automatic process did not complete. Do not submit duplicate, fabricated or materially inaccurate reports. Flight hours, points, tiers and airframe records are credited only after BAV’s applicable operational review."],
  ["09", "Content, privacy and intellectual property", "Respect other members’ privacy and do not share personal information, private messages, credentials, session details or restricted screenshots. BAV and Ember content may not be redistributed, mirrored, repackaged or falsely represented as your own without written permission from FreeFlightLTD or the relevant rights holder."],
  ["10", "Enforcement and appeals", "Staff may investigate behaviour or operational records and issue guidance, warnings, restrictions, suspensions or permanent removal where necessary to protect the community and systems. Serious security, privacy, fraud or software-distribution breaches may result in immediate action. You may request a calm review through the appropriate support channel."],
  ["11", "Changes to these rules", "BAV may update these rules as its systems grow. Material updates will be published on this page with a new version date. Continued use of BAV services after a published update means you agree to follow the revised rules."],
] as const;

export default function PilotRulesPage() {
  return (
    <>
      <SiteHeader />
      <main className="pilot-rules-page">
        <section className="pilot-rules-hero">
          <div className="pilot-rules-shell">
            <span>BAV pilot standards</span>
            <h1>{PILOT_RULES_TITLE}</h1>
            <p>Clear expectations for a fair, realistic and professional virtual-airline experience.</p>
            <small>Rules version {PILOT_RULES_VERSION}</small>
          </div>
        </section>
        <section className="pilot-rules-shell pilot-rules-intro">
          <div><span>Read before you fly</span><h2>A shared standard for every BAV pilot.</h2></div>
          <p>These rules apply to the BAV website, pilot account, Ember ACARS Systems, BA-Radar, Staff Centre interactions and official BAV community spaces. New pilots must explicitly accept them before an account is created.</p>
        </section>
        <section className="pilot-rules-shell pilot-rules-grid" aria-label="BAV pilot rules">
          {rules.map(([number, title, copy]) => <article key={number}><span>{number}</span><h2>{title}</h2><p>{copy}</p></article>)}
        </section>
        <section className="pilot-rules-shell pilot-rules-help">
          <div><span>Questions or concerns?</span><h2>We are here to help pilots operate correctly.</h2><p>Use the handbook for operational guidance. If a rule or system outcome is unclear, contact BAV support before continuing.</p></div>
          <div><Link className="button button-primary" href="/handbook">Open the handbook</Link><Link className="button button-outline" href="/support/tickets/new">Contact support</Link></div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
