import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { fleet } from "@/lib/mockData";
import { isCareerFeatureEnabled } from "@/lib/career-experience";
import { getCareerDashboard } from "@/lib/pilot-career";
import { getActiveFleetFlightAssignmentForPilot, listFleetAircraft } from "@/lib/fleet-service";
import { getPilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";
import { listPilotPireps } from "@/lib/pilot-operations-store";
import { CareerFleetPortfolio } from "@/app/account/career/CareerFleetPortfolio";

export const metadata = { title: "Fleet" };

export default async function FleetPage() {
  const total = fleet.reduce((sum, aircraft) => sum + aircraft.count, 0);
  let pilotPortfolio = null;

  if (isCareerFeatureEnabled("fleet")) {
    const session = await getPilotSession();
    const pilot = session ? await getPilotById(session.pilotId) : null;
    if (pilot) {
      const [career, pireps, fleetAircraft, assignment] = await Promise.all([
        getCareerDashboard(pilot),
        listPilotPireps(pilot.id),
        listFleetAircraft().catch(() => []),
        getActiveFleetFlightAssignmentForPilot({ subject: `bav:${pilot.id}`, displayName: pilot.name, fleetRole: "pilot" }).catch(() => null),
      ]);
      pilotPortfolio = <section className="fleet-pilot-portfolio" aria-label="Your Fleet Career portfolio"><CareerFleetPortfolio fleetAircraft={fleetAircraft} pireps={pireps} qualifications={career.qualifications} activeAssignment={assignment?.flightReference ?? null} /></section>;
    }
    if (!pilotPortfolio) pilotPortfolio = <section className="fleet-career-signin"><div><span>PILOT CAREER</span><h2>Your Fleet Career</h2><p>Sign in to see your accepted flights, block hours, aircraft experience and qualification context alongside the BAV Fleet.</p></div><Link href="/login">Sign in to view your portfolio →</Link></section>;
  }

  return (
    <>
      <SiteHeader />

      <main className="fleet-showcase-page">
        <section
          className="fleet-showcase-hero"
          aria-labelledby="fleet-hero-title"
        >
          <div className="fleet-hero-copy"><span>VIRTUAL OPERATIONS</span><h1 id="fleet-hero-title">Fleet</h1><p>Explore the aircraft that support British Airways Virtual operations, from regional flying to long-haul services.</p></div>
          <div className="fleet-hero-mark" aria-hidden="true"><i /><span>BRITISH AIRWAYS VIRTUAL</span><strong>OPERATIONS</strong></div>
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

          {pilotPortfolio}

          <section className="fleet-showcase-grid" aria-label="British Airways Virtual fleet types">
            {fleet.map((aircraft) => (
              <article className="fleet-showcase-card" key={aircraft.type}>
                <div className="fleet-card-family">{aircraft.family}</div>
                <h2>{aircraft.type}</h2>
                <p>{aircraft.count} aircraft in the initial seed dataset.</p>
                <div className="fleet-card-image-space" aria-hidden="true" />
                <Link className="fleet-card-link" href={`/book?aircraft=${encodeURIComponent(aircraft.type)}`}>
                  View available flights <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </section>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
