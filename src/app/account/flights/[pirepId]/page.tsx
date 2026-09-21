import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getAcarsSession, listAcarsSessionSnapshots } from "@/lib/acars-store";
import type { AcarsFlightSnapshot, SupportedSimulator } from "@/lib/acars-contract";
import { getPirep } from "@/lib/pilot-operations-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import "./debrief.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Flight debrief" };

const simulatorNames: Record<SupportedSimulator, string> = {
  xplane12: "X-Plane 12",
  msfs2020: "Microsoft Flight Simulator 2020",
  msfs2024: "Microsoft Flight Simulator 2024",
};

function duration(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function timestamp(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(date);
}

function maximum(snapshots: AcarsFlightSnapshot[], field: "altitudeFt" | "groundSpeedKt") {
  if (!snapshots.length) return null;
  return Math.round(Math.max(...snapshots.map((snapshot) => snapshot[field])));
}

function prettyStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function FlightDebriefPage({ params }: { params: Promise<{ pirepId: string }> }) {
  const [{ pirepId }, pilot] = await Promise.all([params, requirePilotSession()]);
  const pirep = await getPirep(pirepId);
  if (!pirep || pirep.pilotId !== pilot.pilotId) notFound();

  const acarsSession = pirep.acarsSessionId ? await getAcarsSession(pirep.acarsSessionId).catch(() => null) : null;
  const session = acarsSession?.pilotId === pilot.pilotId ? acarsSession : null;
  const snapshots = session ? await listAcarsSessionSnapshots(session.id, pilot.pilotId).catch(() => []) : [];
  const firstAirborneIndex = snapshots.findIndex((snapshot) => !snapshot.onGround);
  const firstAirborne = firstAirborneIndex >= 0 ? snapshots[firstAirborneIndex] : null;
  const firstArrivalGround = firstAirborneIndex >= 0 ? snapshots.slice(firstAirborneIndex + 1).find((snapshot) => snapshot.onGround) ?? null : null;
  const maxAltitude = maximum(snapshots, "altitudeFt");
  const maxGroundSpeed = maximum(snapshots, "groundSpeedKt");
  const registration = session?.lastSnapshot?.registration ?? null;
  const reportCount = snapshots.length;

  return <><SiteHeader /><main className="page-shell debrief-page"><div className="page-container debrief-container">
    <nav className="debrief-breadcrumb" aria-label="Breadcrumb"><Link href="/account">Pilot dashboard</Link><span>›</span><span>Flight debrief</span></nav>
    <section className="debrief-hero">
      <div><span className="section-kicker">BAV FLIGHT DEBRIEF</span><h1>{pirep.flightNumber} · {pirep.from} <b>→</b> {pirep.to}</h1><p>{pirep.aircraft} · {simulatorNames[pirep.simulator]} · completed {timestamp(pirep.completedAt)}</p></div>
      <span className={`debrief-status ${pirep.status}`}>{prettyStatus(pirep.status)}</span>
    </section>

    <section className="debrief-summary" aria-label="Flight summary">
      <article><span>BLOCK TIME</span><strong>{duration(pirep.blockMinutes)}</strong><small>From ACARS start to completion</small></article>
      <article><span>DISTANCE</span><strong>{Math.round(pirep.distanceNm).toLocaleString()} NM</strong><small>Recorded from simulator telemetry</small></article>
      <article><span>LANDING RATE</span><strong>{pirep.landingFpm == null ? "—" : `${pirep.landingFpm} fpm`}</strong><small>{pirep.landingFpm == null ? "Not supplied by the simulator" : "Recorded at arrival"}</small></article>
      <article><span>FUEL USED</span><strong>{pirep.fuelUsedKg == null ? "—" : `${pirep.fuelUsedKg.toLocaleString()} kg`}</strong><small>{pirep.fuelUsedKg == null ? "Not supplied by the simulator" : "Recorded by ACARS"}</small></article>
    </section>

    <div className="debrief-grid">
      <section className="debrief-card"><span className="debrief-label">FLIGHT TIMELINE</span><h2>What Ember recorded</h2><ol className="debrief-timeline">
        <li><i className="complete" aria-hidden="true" /><div><strong>{pirep.source === "acars" ? "ACARS session started" : "Flight record started"}</strong><span>{timestamp(session?.startedAt ?? pirep.startedAt)}</span></div></li>
        {firstAirborne ? <li><i className="complete" aria-hidden="true" /><div><strong>First airborne telemetry report</strong><span>{timestamp(firstAirborne.timestamp)}</span></div></li> : <li><i aria-hidden="true" /><div><strong>Airborne telemetry</strong><span>Not available in this flight record</span></div></li>}
        {firstArrivalGround ? <li><i className="complete" aria-hidden="true" /><div><strong>First on-ground report after flight</strong><span>{timestamp(firstArrivalGround.timestamp)}</span></div></li> : <li><i aria-hidden="true" /><div><strong>Arrival ground telemetry</strong><span>Not available in this flight record</span></div></li>}
        <li><i className="complete" aria-hidden="true" /><div><strong>{pirep.source === "acars" ? "ACARS session completed" : "Manual flight report submitted"}</strong><span>{timestamp(session?.completedAt ?? pirep.completedAt)}</span></div></li>
        <li><i className={pirep.status === "accepted" ? "complete" : "pending"} aria-hidden="true" /><div><strong>PIREP {prettyStatus(pirep.status)}</strong><span>{pirep.reviewedAt ? `Reviewed ${timestamp(pirep.reviewedAt)}` : "Awaiting BAV Operations review"}</span></div></li>
      </ol></section>

      <section className="debrief-card"><span className="debrief-label">TELEMETRY RECORD</span><h2>Simulator capture</h2><dl className="debrief-data">
        <div><dt>Aircraft registration</dt><dd>{registration ?? "Not reported"}</dd></div>
        <div><dt>Highest observed altitude</dt><dd>{maxAltitude == null ? "Not recorded" : `${maxAltitude.toLocaleString()} ft`}</dd></div>
        <div><dt>Highest observed ground speed</dt><dd>{maxGroundSpeed == null ? "Not recorded" : `${maxGroundSpeed.toLocaleString()} kt`}</dd></div>
        <div><dt>Telemetry reports</dt><dd>{reportCount ? reportCount.toLocaleString() : "No live reports"}</dd></div>
        <div><dt>ACARS source</dt><dd>{pirep.source === "acars" ? "Ember automatic record" : "Manual PIREP fallback"}</dd></div>
        <div><dt>Simulator</dt><dd>{simulatorNames[pirep.simulator]}</dd></div>
      </dl>
      <p className="debrief-note">Observed values are calculated only from the simulator reports saved for this flight. A manual fallback PIREP can still be reviewed, but it has no invented telemetry.</p></section>
    </div>

    <section className="debrief-card debrief-review"><div><span className="debrief-label">OPERATIONS REVIEW</span><h2>{pirep.status === "accepted" ? "Flight credit accepted" : pirep.status === "rejected" ? "Flight report not accepted" : pirep.status === "changes_requested" ? "More information requested" : "Your PIREP is in review"}</h2><p>{pirep.staffComments || (pirep.status === "accepted" ? "BAV career credit has been applied to your pilot account." : "BAV Operations will review the submitted flight record. You do not need to submit a manual duplicate when this is an Ember ACARS report.")}</p></div><Link className="button button-outline" href="/account">Back to dashboard</Link></section>
  </div></main><SiteFooter /></>;
}
