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
      <main className="page-shell">
        <div className="page-container wide-page">
          <section className="page-heading">
            <div className="section-kicker">Virtual operations</div>
            <h1>Fleet</h1>
            <p>
              Initial fleet catalogue for the British Airways Virtual production website. Aircraft availability, registrations, maintenance status and Phoenix assignment rules will be connected to live operational data later.
            </p>
          </section>

          <div className="network-toolbar card">
            <div><strong>{fleet.length}</strong><span>Aircraft types</span></div>
            <div><strong>{total}</strong><span>Seed aircraft count</span></div>
            <div><strong>3</strong><span>Operating families</span></div>
            <Link className="button button-primary" href="/book">Find a flight</Link>
          </div>

          <section className="fleet-grid">
            {fleet.map((aircraft) => (
              <article className="fleet-card card" key={aircraft.type}>
                <div className="fleet-card-art" aria-hidden="true">✈</div>
                <div className="section-kicker">{aircraft.family}</div>
                <h2>{aircraft.type}</h2>
                <p>{aircraft.count} aircraft in the initial seed dataset.</p>
                <Link href={`/book?aircraft=${encodeURIComponent(aircraft.type)}`}>View available flights</Link>
              </article>
            ))}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
