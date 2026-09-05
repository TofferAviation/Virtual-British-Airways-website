import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { fleet } from "@/lib/mockData";

export const metadata = { title: "Fleet" };

export default function FleetPage() {
  const total = fleet.reduce((sum, aircraft) => sum + aircraft.count, 0);

  return (
    <>
      <SiteHeader />

      <main className="fleet-showcase-page">
        <section className="fleet-showcase-hero">
          <div className="fleet-showcase-hero-inner">
            <div className="fleet-showcase-kicker">Virtual operations</div>
            <h1>Fleet</h1>
            <p>
              Explore the British Airways Virtual fleet catalogue. Aircraft availability, registrations,
              maintenance status and Phoenix assignment rules will be connected to live operational data as the
              platform develops.
            </p>
          </div>

          <div className="fleet-hero-mark" aria-hidden="true">
            <span className="mark-red" />
            <span className="mark-white" />
            <span className="mark-blue" />
          </div>
        </section>

        <div className="fleet-showcase-shell">
          <section className="fleet-overview-card" aria-label="Fleet overview">
            <div className="fleet-overview-stat">
              <strong>{fleet.length}</strong>
              <span>Aircraft types</span>
            </div>
            <div className="fleet-overview-stat">
              <strong>{total}</strong>
              <span>Seed aircraft count</span>
            </div>
            <div className="fleet-overview-stat">
              <strong>3</strong>
              <span>Operating families</span>
            </div>
            <div className="fleet-overview-action">
              <Link className="button button-primary" href="/book">
                Find a flight <span aria-hidden="true">→</span>
              </Link>
            </div>
          </section>

          <section className="fleet-showcase-grid" aria-label="British Airways Virtual fleet types">
            {fleet.map((aircraft) => (
              <article className="fleet-showcase-card" key={aircraft.type}>
                <div className="fleet-card-family">{aircraft.family}</div>
                <h2>{aircraft.type}</h2>
                <p>{aircraft.count} aircraft in the current British Airways Virtual seed fleet.</p>
                <div className="fleet-card-note">Aircraft artwork will be added when approved models are supplied.</div>
                <Link className="fleet-card-link" href={`/book?aircraft=${encodeURIComponent(aircraft.type)}`}>
                  View available flights <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </section>

          <p className="fleet-showcase-footnote">
            Fleet quantities are currently development seed data and will later be replaced by live operational
            records from the British Airways Virtual backend.
          </p>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
