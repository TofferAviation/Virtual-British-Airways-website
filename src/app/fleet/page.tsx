import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { isCareerFeatureEnabled } from "@/lib/career-experience";
import { getCareerDashboard } from "@/lib/pilot-career";
import { getActiveFleetFlightAssignmentForPilot, listFleetAircraft } from "@/lib/fleet-service";
import { getPilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";
import { listPilotPireps } from "@/lib/pilot-operations-store";
import { CareerFleetPortfolio } from "@/app/account/career/CareerFleetPortfolio";
import { FleetOverviewClient } from "./FleetOverviewClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fleet" };

export default async function FleetPage() {
  const [session, aircraftResult] = await Promise.all([
    getPilotSession(),
    listFleetAircraft().then((aircraft) => ({ aircraft, error: "" })).catch(() => ({ aircraft: [], error: "The live Fleet directory is temporarily unavailable." })),
  ]);
  const pilot = session ? await getPilotById(session.pilotId) : null;
  const [career, pireps, assignment] = pilot && isCareerFeatureEnabled("fleet")
    ? await Promise.all([getCareerDashboard(pilot), listPilotPireps(pilot.id), getActiveFleetFlightAssignmentForPilot({ subject: `bav:${pilot.id}`, displayName: pilot.name, fleetRole: "pilot" }).catch(() => null)])
    : [null, [], null];
  const available = aircraftResult.aircraft.filter((item) => item.operationalStatus === "available" && item.dispatchStatus !== "not_dispatchable").length;
  const active = aircraftResult.aircraft.filter((item) => ["assigned", "in_service", "turnaround"].includes(item.operationalStatus)).length;

  return <><SiteHeader /><main className="fleet-showcase-page fleet-profile-page">
    <section className="fleet-showcase-hero" aria-labelledby="fleet-hero-title"><div className="fleet-hero-copy"><span>VIRTUAL OPERATIONS</span><h1 id="fleet-hero-title">Fleet</h1><p>Explore the individual aircraft behind British Airways Virtual operations—each registration has its own location, service state and BAV flying story.</p></div><div className="fleet-hero-mark" aria-hidden="true"><i /><span>BRITISH AIRWAYS VIRTUAL</span><strong>OPERATIONS</strong></div></section>
    <div className="fleet-showcase-shell">
      <section className="fleet-overview-card fleet-profile-overview-stats" aria-label="Fleet overview"><div className="fleet-overview-stat"><strong>{aircraftResult.aircraft.length.toLocaleString("en-GB")}</strong><span>Registered airframes</span></div><div className="fleet-overview-stat"><strong>{available.toLocaleString("en-GB")}</strong><span>Available now</span></div><div className="fleet-overview-stat"><strong>{active.toLocaleString("en-GB")}</strong><span>In operation</span></div><div className="fleet-overview-action"><Link className="button button-primary" href="/book">Find a flight <span aria-hidden="true">→</span></Link></div></section>
      {pilot && career ? <section className="fleet-pilot-portfolio" aria-label="Your Fleet Career portfolio"><CareerFleetPortfolio fleetAircraft={aircraftResult.aircraft} pireps={pireps} qualifications={career.qualifications} activeAssignment={assignment?.flightReference ?? null} /></section> : <section className="fleet-career-signin"><div><span>PILOT CAREER</span><h2>Your Fleet Career</h2><p>Sign in to see which registrations you have operated and how each aircraft fits into your virtual career.</p></div><Link href="/login">Sign in to view your portfolio →</Link></section>}
      {aircraftResult.error ? <section className="fleet-profile-empty"><strong>Fleet directory unavailable</strong><span>{aircraftResult.error}</span></section> : <FleetOverviewClient aircraft={aircraftResult.aircraft} />}
    </div>
  </main><SiteFooter /></>;
}
