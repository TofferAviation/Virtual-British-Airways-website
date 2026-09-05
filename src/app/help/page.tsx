import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Help" };

const helpItems = [
  ["Pilot login", "Production authentication will use vAMSYS or another approved identity handoff. Pilots should never give this website their vAMSYS password directly."],
  ["Phoenix statistics", "The website and Phoenix are planned to read the same pilot record so flights, hours, landings, points and progression remain consistent."],
  ["Flight assignments", "The current schedule is mock data. Later, selecting a flight will create a real pilot assignment in the shared backend."],
  ["VA Points", "VA Points and Tier Points are virtual-airline progression metrics only. They are not Avios and have no real-world monetary value."],
  ["Network data", "The seed project includes the full destination list used by the prototype. Route/date availability will move to a maintained schedule database."],
  ["Support", "Discord, operations-manual and service-status integrations can be added once the production URLs and systems are ready."],
];

export default function HelpPage() {
  return (
    <>
      <SiteHeader />
      <main className="page-shell">
        <div className="page-container">
          <section className="page-heading">
            <div className="section-kicker">Pilot support</div>
            <h1>Help centre</h1>
            <p>Production foundation guidance for British Airways Virtual pilots.</p>
          </section>

          <section className="help-grid">
            {helpItems.map(([title, body]) => (
              <article className="help-card card" key={title}>
                <h2>{title}</h2>
                <p>{body}</p>
              </article>
            ))}
          </section>

          <section className="support-cta card">
            <div>
              <div className="section-kicker">Need to fly?</div>
              <h2>Return to operations</h2>
              <p>Search the virtual network or open the pilot account preview.</p>
            </div>
            <div className="support-cta-actions">
              <Link className="button button-primary" href="/book">Search flights</Link>
              <Link className="button button-outline" href="/account">Pilot account</Link>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
