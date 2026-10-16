import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getAcarsSession, listAcarsPositionReports, type AcarsPositionReport } from "@/lib/acars-store";
import { supportedSimulatorLabels } from "@/lib/acars-contract";
import { getPilotFlightPlan, getPirep } from "@/lib/pilot-operations-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import "./flight-debrief.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Flight debrief" };

function duration(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function number(value: number | null, suffix: string) {
  return value == null ? "—" : `${Math.round(value).toLocaleString("en-GB")}${suffix}`;
}

function time(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(date);
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" }).format(date).replace(",", "") + " UTC";
}

function compactTrail(reports: AcarsPositionReport[]) {
  if (reports.length <= 220) return reports;
  const stride = Math.ceil(reports.length / 220);
  return reports.filter((_, index) => index === 0 || index === reports.length - 1 || index % stride === 0);
}

function FlightTrail({ reports }: { reports: AcarsPositionReport[] }) {
  const trail = compactTrail(reports);
  if (trail.length < 2) return <div className="debrief-trail-empty"><span aria-hidden="true">⌁</span><p>{reports.length ? "Ember saved the final flight state, but not enough position samples for a route trace." : "This PIREP was filed without an Ember position trace."}</p></div>;

  const wrapsDateLine = Math.max(...trail.map((point) => point.longitude)) - Math.min(...trail.map((point) => point.longitude)) > 180;
  const coordinates = trail.map((point) => ({ latitude: point.latitude, longitude: wrapsDateLine && point.longitude < 0 ? point.longitude + 360 : point.longitude }));
  const minLongitude = Math.min(...coordinates.map((point) => point.longitude)); const maxLongitude = Math.max(...coordinates.map((point) => point.longitude));
  const minLatitude = Math.min(...coordinates.map((point) => point.latitude)); const maxLatitude = Math.max(...coordinates.map((point) => point.latitude));
  const longitudeRange = Math.max(1, maxLongitude - minLongitude); const latitudeRange = Math.max(1, maxLatitude - minLatitude);
  const pad = 28; const width = 920; const height = 268;
  const project = (point: { latitude: number; longitude: number }) => ({ x: pad + ((point.longitude - minLongitude) / longitudeRange) * (width - pad * 2), y: height - pad - ((point.latitude - minLatitude) / latitudeRange) * (height - pad * 2) });
  const path = coordinates.map((point, index) => { const position = project(point); return `${index ? "L" : "M"}${position.x.toFixed(1)} ${position.y.toFixed(1)}`; }).join(" ");
  const departure = project(coordinates[0]); const arrival = project(coordinates[coordinates.length - 1]);

  return <div className="debrief-trail" role="img" aria-label={`Tracked route from ${reports[0].timestamp} to ${reports[reports.length - 1].timestamp}`}>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="debrief-route" x1="0" x2="1"><stop stopColor="#ffcf71" /><stop offset="1" stopColor="#5dd8ff" /></linearGradient><pattern id="debrief-grid" width="56" height="56" patternUnits="userSpaceOnUse"><path d="M 56 0 L 0 0 0 56" fill="none" stroke="rgba(190,218,241,.12)" strokeWidth="1" /></pattern></defs>
      <rect width={width} height={height} fill="url(#debrief-grid)" />
      <path d={path} fill="none" stroke="rgba(255,207,113,.18)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d={path} fill="none" stroke="url(#debrief-route)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={departure.x} cy={departure.y} r="6" fill="#ffcf71" /><circle cx={arrival.x} cy={arrival.y} r="6" fill="#5dd8ff" />
    </svg>
    <span className="debrief-trail-label departure">Recorded start</span><span className="debrief-trail-label arrival">Recorded finish</span>
  </div>;
}

export default async function FlightDebriefPage({ params }: { params: Promise<{ pirepId: string }> }) {
  const [{ pirepId }, session] = await Promise.all([params, requirePilotSession()]);
  const pirep = await getPirep(pirepId);
  if (!pirep || pirep.pilotId !== session.pilotId) notFound();

  const acars = pirep.acarsSessionId ? await getAcarsSession(pirep.acarsSessionId).catch(() => null) : null;
  if (acars && acars.pilotId !== session.pilotId) notFound();
  const [reports, flightPlan] = await Promise.all([
    acars ? listAcarsPositionReports(acars.id, session.pilotId).catch(() => []) : Promise.resolve([]),
    pirep.bookingId ? getPilotFlightPlan(pirep.bookingId, session.pilotId) : Promise.resolve(null),
  ]);
  const airborne = reports.filter((report) => !report.onGround && report.altitudeFt > 400);
  const highestAltitude = airborne.length ? Math.max(...airborne.map((report) => report.altitudeFt)) : null;
  const highestGroundSpeed = airborne.length ? Math.max(...airborne.map((report) => report.groundSpeedKt)) : null;
  const takeoff = airborne[0] ?? null;
  const topOfClimb = airborne.length ? airborne.reduce((highest, report) => report.altitudeFt > highest.altitudeFt ? report : highest) : null;
  const recordedEnd = reports.at(-1) ?? acars?.lastSnapshot ?? null;
  const reviewed = pirep.status === "accepted";
  const statusCopy = pirep.status === "accepted" ? "Accepted by BAV Operations" : pirep.status === "changes_requested" ? "A clarification has been requested" : pirep.status === "rejected" ? "Not accepted" : "Awaiting BAV Operations review";

  return <><SiteHeader /><main className="debrief-page">
    <section className="debrief-hero"><div className="debrief-shell"><Link className="debrief-back" href="/account">← Your flight reports</Link><span className="debrief-kicker">BAV FLIGHT DEBRIEF</span><h1>{pirep.flightNumber} <span>·</span> {pirep.from} → {pirep.to}</h1><p>{dateTime(pirep.completedAt)} · {pirep.aircraft} · {supportedSimulatorLabels[pirep.simulator]}</p><div className={`debrief-status ${pirep.status}`}><i aria-hidden="true" />{statusCopy}</div></div></section>
    <section className="debrief-shell debrief-content">
      <div className="debrief-intro"><div><span className="debrief-kicker">YOUR FLIGHT, RECORDED</span><h2>A debrief built from your flight record.</h2><p>This is a factual flight summary, not a rating. It shows the data Ember and your BAV PIREP actually recorded, keeping the parts that matter available after shutdown.</p></div><div className="debrief-review-note"><strong>{reviewed ? `+${pirep.pointsAwarded.toFixed(1)} VA Points` : "Flight report submitted"}</strong><span>{reviewed ? `+${pirep.tierPointsAwarded} Tier Points applied` : "Rewards follow staff review"}</span></div></div>
      <section className="debrief-metrics" aria-label="Flight facts"><article><span>BLOCK TIME</span><strong>{duration(pirep.blockMinutes)}</strong><small>From PIREP</small></article><article><span>DISTANCE FLOWN</span><strong>{Math.round(pirep.distanceNm).toLocaleString("en-GB")} nm</strong><small>From PIREP</small></article><article><span>LANDING RATE</span><strong>{number(pirep.landingFpm, " fpm")}</strong><small>{pirep.landingFpm == null ? "Not recorded" : "Final recorded rate"}</small></article><article><span>FUEL USED</span><strong>{number(pirep.fuelUsedKg, " kg")}</strong><small>{pirep.fuelUsedKg == null ? "Not recorded" : "From PIREP"}</small></article></section>
      <section className="debrief-route-card"><div className="debrief-section-heading"><div><span className="debrief-kicker">TRACKED FLIGHT PATH</span><h2>Your route through Ember</h2><p>{reports.length ? `${reports.length.toLocaleString("en-GB")} saved ACARS position samples · only visible to you and authorised BAV Operations.` : "No ACARS position trace was saved with this report."}</p></div>{reports.length ? <span className="debrief-sample-badge">ACARS trace</span> : null}</div><FlightTrail reports={reports} /></section>
      <div className="debrief-detail-grid"><section className="debrief-panel"><span className="debrief-kicker">FLIGHT MOMENTS</span><h2>The recorded journey</h2><dl className="debrief-moments"><div><dt>Off-block record</dt><dd>{time(pirep.startedAt)} UTC</dd></div><div><dt>Airborne sample</dt><dd>{takeoff ? `${time(takeoff.timestamp)} UTC · ${Math.round(takeoff.altitudeFt).toLocaleString("en-GB")} ft` : "Not available"}</dd></div><div><dt>Highest tracked altitude</dt><dd>{highestAltitude == null ? "Not available" : `${Math.round(highestAltitude).toLocaleString("en-GB")} ft at ${time(topOfClimb?.timestamp)} UTC`}</dd></div><div><dt>Highest tracked ground speed</dt><dd>{highestGroundSpeed == null ? "Not available" : `${Math.round(highestGroundSpeed)} kt`}</dd></div><div><dt>Final recorded state</dt><dd>{recordedEnd ? `${time(recordedEnd.timestamp)} UTC · ${recordedEnd.onGround ? "on the ground" : `${Math.round(recordedEnd.altitudeFt).toLocaleString("en-GB")} ft`}` : "Not available"}</dd></div><div><dt>PIREP completed</dt><dd>{time(pirep.completedAt)} UTC</dd></div></dl></section>
        <section className="debrief-panel dispatch"><span className="debrief-kicker">ORIGINAL DISPATCH</span><h2>What you prepared</h2>{flightPlan?.status === "synced" ? <dl className="debrief-moments"><div><dt>SimBrief OFP</dt><dd>{flightPlan.simbriefOfpId ? `#${flightPlan.simbriefOfpId}` : "Synced to this assignment"}</dd></div><div><dt>Route</dt><dd>{flightPlan.route ?? "Not supplied"}</dd></div><div><dt>Initial cruise</dt><dd>{flightPlan.cruiseAltitude ?? "Not supplied"}</dd></div><div><dt>Alternate</dt><dd>{flightPlan.alternate ?? "Not supplied"}</dd></div></dl> : <p className="debrief-muted">This flight did not have a synced SimBrief dispatch attached. The PIREP remains the source for its logged flight facts.</p>}</section></div>
      <section className="debrief-footnote"><strong>Built for reflection, not judgment.</strong><span>Numbers are shown when BAV received them. Manual PIREPs and interrupted telemetry may have fewer details; BAV does not invent missing flight events.</span></section>
    </section>
  </main><SiteFooter /></>;
}
