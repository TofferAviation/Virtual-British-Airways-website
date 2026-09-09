import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { listLiveAcarsSessions } from "@/lib/acars-store";
import { supportedSimulatorLabels } from "@/lib/acars-contract";
import { requireStaffSession } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live Operations" };

export default async function LiveOperationsPage() {
  await requireStaffSession();
  const sessions = await listLiveAcarsSessions();
  const healthy = sessions.filter((session) => session.connectionHealthy).length;

  return <>
    <SiteHeader />
    <main className="ops-page">
      <section className="ops-hero"><div className="ops-shell"><span className="ops-kicker">BAV Operations</span><h1>Live Operations</h1><p>Active FreeFlight BAV ACARS flights across X-Plane 12, Microsoft Flight Simulator 2020 and Microsoft Flight Simulator 2024.</p></div></section>
      <section className="ops-shell ops-summary">
        <div><strong>{sessions.length}</strong><span>Active flights</span></div>
        <div><strong>{healthy}</strong><span>Healthy links</span></div>
        <div><strong>{sessions.length - healthy}</strong><span>Stale links</span></div>
        <Link className="ops-secondary" href="/staff">Staff Centre</Link>
      </section>
      <section className="ops-shell ops-live-list">
        {sessions.length ? sessions.map((session) => {
          const snap = session.lastSnapshot;
          return <article className="ops-card ops-live-card" key={session.id}>
            <div className="ops-live-head"><div><span className="ops-kicker">{session.pilotNumber} · {supportedSimulatorLabels[session.simulator]}</span><h2>{session.flightNumber} · {session.from} → {session.to}</h2><p>{session.pilotName} · {session.aircraft}</p></div><span className={`ops-connection ${session.connectionHealthy ? "healthy" : "stale"}`}>{session.connectionHealthy ? "Connected" : "Stale"}</span></div>
            <div className="ops-review-data">
              <div><span>Altitude</span><strong>{snap ? `${Math.round(snap.altitudeFt).toLocaleString()} ft` : "Waiting"}</strong></div>
              <div><span>Ground speed</span><strong>{snap ? `${Math.round(snap.groundSpeedKt)} kt` : "—"}</strong></div>
              <div><span>Heading</span><strong>{snap ? `${Math.round(snap.headingDeg)}°` : "—"}</strong></div>
              <div><span>Fuel</span><strong>{snap?.fuelKg == null ? "—" : `${Math.round(snap.fuelKg).toLocaleString()} kg`}</strong></div>
              <div><span>Tracked</span><strong>{Math.round(session.distanceNm)} NM</strong></div>
            </div>
            <div className="ops-live-foot"><span>{snap ? `${snap.latitude.toFixed(4)}, ${snap.longitude.toFixed(4)}` : "No telemetry received yet"}</span><span>Last update {new Date(session.updatedAt).toLocaleTimeString("en-GB")}</span></div>
          </article>;
        }) : <div className="ops-card ops-empty"><h2>No live ACARS flights</h2><p>When a BAV pilot starts FreeFlight ACARS, the flight will appear here automatically.</p></div>}
      </section>
    </main>
    <SiteFooter />
  </>;
}
