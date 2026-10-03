import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getFleetAircraftProfile } from "@/lib/fleet-service";
import { getPilotSession } from "@/lib/pilot-auth";
import { AircraftHistoryTimeline } from "./AircraftHistoryTimeline";
import { AircraftRouteHistory } from "./AircraftRouteHistory";

export const dynamic = "force-dynamic";
export const metadata = { title: "Aircraft profile" };

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function duration(minutes: number) {
  return `${Math.floor(minutes / 60).toLocaleString("en-GB")}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function date(value: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function dateTime(value: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" }).format(parsed);
}

function aircraftAge(deliveryDate: string | null) {
  if (!deliveryDate) return "Not recorded";
  const delivery = new Date(deliveryDate);
  if (Number.isNaN(delivery.getTime())) return "Not recorded";
  const months = Math.max(0, (new Date().getUTCFullYear() - delivery.getUTCFullYear()) * 12 + new Date().getUTCMonth() - delivery.getUTCMonth());
  return `${Math.floor(months / 12)}y ${months % 12}m`;
}

function engineSummary(value: unknown) {
  if (!Array.isArray(value) || !value.length) return "Not recorded";
  return value.map((engine) => typeof engine === "object" && engine ? Object.values(engine as Record<string, unknown>).find((item) => typeof item === "string") : null).filter((item): item is string => Boolean(item)).join(" · ") || "Configured in Fleet";
}

function cabinSummary(value: unknown) {
  if (!value || typeof value !== "object") return "Not recorded";
  const data = value as Record<string, unknown>;
  const seats = data.totalSeats ?? data.total_seats ?? data.seatCount ?? data.seat_count;
  return typeof seats === "number" ? `${seats.toLocaleString("en-GB")} seats` : "Configured in Fleet";
}

export default async function AircraftProfilePage({ params }: { params: Promise<{ registration: string }> }) {
  const [{ registration }, session] = await Promise.all([params, getPilotSession()]);
  const profile = await getFleetAircraftProfile(decodeURIComponent(registration), session?.pilotId);
  if (!profile) notFound();
  const { aircraft, operation, maintenance, statistics, recentFlights, logbook, pilotHistory } = profile;

  return <><SiteHeader /><main className="fleet-profile-page"><div className="fleet-profile-shell">
    <nav className="fleet-profile-breadcrumbs" aria-label="Breadcrumb"><Link href="/fleet">Fleet</Link><span>›</span><strong>{aircraft.registration}</strong></nav>
    <section className="fleet-aircraft-hero">
      <div className="fleet-aircraft-hero-copy"><span className="fleet-profile-kicker">BAV AIRCRAFT PROFILE</span><h1>{aircraft.registration}</h1><p>{aircraft.aircraftModel}{aircraft.variant ? ` · ${aircraft.variant}` : ""}</p><div className="fleet-aircraft-hero-tags"><b>{label(aircraft.technicalStatus)}</b><b>{label(operation.state)}</b>{aircraft.currentLivery ? <b>{aircraft.currentLivery}</b> : null}</div></div>
      <div className="fleet-aircraft-hero-photo">{aircraft.image ? <img src={aircraft.image.url} alt={`${aircraft.registration} ${aircraft.aircraftModel}`} /> : <span aria-hidden="true">✈</span>}{aircraft.image?.credit ? <small>Photo · {aircraft.image.credit}</small> : null}</div>
      <dl className="fleet-aircraft-hero-state"><div><dt>Fleet ID</dt><dd>{aircraft.fleetNumber ?? "Not assigned"}</dd></div><div><dt>Current location</dt><dd>{operation.airport ?? "Location pending"}</dd></div><div><dt>Operational state</dt><dd>{label(operation.state)}</dd></div></dl>
    </section>

    <section className="fleet-aircraft-stats" aria-label="BAV simulated operational statistics"><div><span>BAV sectors</span><strong>{statistics.sectors.toLocaleString("en-GB")}</strong><small>Simulated Fleet operations</small></div><div><span>Telemetry distance</span><strong>{statistics.distanceNm == null ? "—" : `${Math.round(statistics.distanceNm).toLocaleString("en-GB")} NM`}</strong><small>Ember-recorded operations</small></div><div><span>Flight time</span><strong>{duration(statistics.flightHoursMinutes)}</strong><small>Simulated Fleet airframe time</small></div><div><span>Cycles</span><strong>{statistics.cycles.toLocaleString("en-GB")}</strong><small>Simulated Fleet cycles</small></div><div><span>Reliability</span><strong>—</strong><small>Not yet measured from BAV data</small></div></section>

    <div className="fleet-aircraft-grid">
      <section className="fleet-aircraft-panel"><span className="fleet-profile-kicker">AIRCRAFT IDENTITY</span><h2>Airframe record</h2><dl className="fleet-aircraft-details"><div><dt>Manufacturer</dt><dd>{aircraft.manufacturer ?? "Not recorded"}</dd></div><div><dt>Model</dt><dd>{aircraft.aircraftModel}</dd></div><div><dt>Registration</dt><dd>{aircraft.registration}</dd></div><div><dt>Fleet number</dt><dd>{aircraft.fleetNumber ?? "Not assigned"}</dd></div><div><dt>Delivery date</dt><dd>{date(aircraft.deliveryDate)}</dd></div><div><dt>Aircraft age</dt><dd>{aircraftAge(aircraft.deliveryDate)}</dd></div><div><dt>Engine configuration</dt><dd>{engineSummary(aircraft.engineData)}</dd></div><div><dt>Cabin configuration</dt><dd>{profile.configuration?.name ?? aircraft.configurationId ?? "Not recorded"}</dd></div><div><dt>Total seats</dt><dd>{cabinSummary(profile.configuration?.cabinDefinition)}</dd></div><div><dt>Current livery</dt><dd>{aircraft.currentLivery ?? "Not recorded"}</dd></div><div><dt>Home base</dt><dd>{aircraft.homeBase ?? "Not recorded"}</dd></div><div><dt>MSN</dt><dd>{aircraft.msn ?? "Not recorded"}</dd></div></dl></section>
      <section className="fleet-aircraft-panel"><span className="fleet-profile-kicker">CURRENT OPERATION</span><h2>Where this airframe is now</h2><div className="fleet-aircraft-operation"><div><span>Current position</span><strong>{operation.airport ?? "Fleet location pending"}</strong><small>{operation.liveTelemetry ? `${Math.round(operation.liveTelemetry.altitudeFt).toLocaleString("en-GB")} ft · ${Math.round(operation.liveTelemetry.groundSpeedKt).toLocaleString("en-GB")} kt` : `Updated ${dateTime(operation.updatedAt)}`}</small></div><div><span>State</span><strong>{label(operation.state)}</strong><small>{label(aircraft.dispatchStatus)}</small></div><div><span>Previous flight</span><strong>{operation.previousFlight ? `${operation.previousFlight.flightReference} · ${operation.previousFlight.departureStation ?? "—"} → ${operation.previousFlight.arrivalStation ?? "—"}` : "No completed BAV flight recorded"}</strong><small>{operation.previousFlight?.pilotName ? `Flown by ${operation.previousFlight.pilotName}` : operation.previousFlight ? dateTime(operation.previousFlight.onBlockAt) : ""}</small></div><div><span>Next assignment</span><strong>{operation.nextAssignment ? `${operation.nextAssignment.flightReference} · ${operation.nextAssignment.departureStation ?? "—"} → ${operation.nextAssignment.arrivalStation ?? "—"}` : "No assignment scheduled"}</strong><small>{operation.nextAssignment ? `${label(operation.nextAssignment.status)}${operation.nextAssignment.pilotDisplayName ? ` · ${operation.nextAssignment.pilotDisplayName}` : ""}` : ""}</small></div></div></section>
    </div>

    <div className="fleet-aircraft-grid fleet-aircraft-grid-reverse">
      <section className="fleet-aircraft-panel"><span className="fleet-profile-kicker">MAINTENANCE & TECHNICAL HEALTH</span><h2>{label(maintenance.serviceability)}</h2><p className="fleet-aircraft-panel-intro">A simplified pilot view of the live Fleet record. Engineering notes and staff actions remain private.</p><dl className="fleet-aircraft-details"><div><dt>Serviceability</dt><dd>{label(maintenance.serviceability)}</dd></div><div><dt>Dispatch state</dt><dd>{label(aircraft.dispatchStatus)}</dd></div><div><dt>Open technical items</dt><dd>{maintenance.openDefects.toLocaleString("en-GB")}</dd></div><div><dt>Next maintenance</dt><dd>{maintenance.nextDue ? `${maintenance.nextDue.task_code} · ${label(maintenance.nextDue.due_status)}` : "No scheduled item shown"}</dd></div><div><dt>Last maintenance</dt><dd>{dateTime(maintenance.lastMaintenanceAt)}</dd></div></dl>{maintenance.deferredDefects.length ? <div className="fleet-aircraft-deferred"><strong>Deferred operational items</strong>{maintenance.deferredDefects.map((defect) => <p key={defect.reference}>{defect.reference} · {defect.category} · {label(defect.status)}{defect.restriction ? ` · ${defect.restriction}` : ""}</p>)}</div> : <p className="fleet-aircraft-clear">No deferred technical items are shown.</p>}</section>
      <section className="fleet-aircraft-panel"><span className="fleet-profile-kicker">YOUR HISTORY WITH {aircraft.registration}</span><h2>{pilotHistory ? pilotHistory.flights ? `${pilotHistory.familiarity.label} familiarity` : "Your first flight awaits" : "Sign in to view your history"}</h2>{pilotHistory ? pilotHistory.flights ? <><div className="fleet-aircraft-personal-stats"><div><span>Flights</span><strong>{pilotHistory.flights}</strong></div><div><span>Time flown</span><strong>{duration(pilotHistory.blockMinutes)}</strong></div><div><span>Distance</span><strong>{Math.round(pilotHistory.distanceNm).toLocaleString("en-GB")} NM</strong></div><div><span>Destinations</span><strong>{pilotHistory.destinations}</strong></div></div><dl className="fleet-aircraft-details"><div><dt>First flight</dt><dd>{date(pilotHistory.firstFlightAt)}</dd></div><div><dt>Latest flight</dt><dd>{date(pilotHistory.latestFlightAt)}</dd></div><div><dt>Longest flight</dt><dd>{pilotHistory.longestFlight ? `${pilotHistory.longestFlight.flightReference} · ${pilotHistory.longestFlight.route}` : "Not recorded"}</dd></div><div><dt>Most common route</dt><dd>{pilotHistory.mostCommonRoute ?? "Not recorded"}</dd></div><div><dt>Your fleet share</dt><dd>{pilotHistory.percentageOfPilotFlights == null ? "Not recorded" : `${pilotHistory.percentageOfPilotFlights}% of accepted PIREPs`}</dd></div></dl><Link className="fleet-aircraft-passport-link" href="/account/career/passport#aircraft-passport">Open your Aircraft Passport →</Link></> : <p className="fleet-aircraft-clear">You haven&apos;t flown {aircraft.registration} on an accepted BAV PIREP yet.</p> : <p className="fleet-aircraft-panel-intro">Sign in to connect this airframe with your personal Career Portfolio.</p>}</section>
    </div>

    <AircraftRouteHistory flights={recentFlights} />
    <AircraftHistoryTimeline events={profile.timeline} sectorMilestones={profile.sectorMilestones} />
    <section className="fleet-aircraft-panel fleet-aircraft-panel-wide"><div className="fleet-aircraft-panel-heading"><div><span className="fleet-profile-kicker">AIRCRAFT LOGBOOK</span><h2>Recent airframe events</h2></div><small>Pilot-safe operational summary</small></div>{logbook.length ? <ol className="fleet-aircraft-logbook">{logbook.map((event) => <li key={event.id}><time>{dateTime(event.occurredAt)}</time><div><span>{event.category}</span><strong>{event.title}</strong><p>{event.detail}{event.station ? ` · ${event.station}` : ""}</p></div></li>)}</ol> : <p className="fleet-aircraft-clear">No pilot-safe logbook events are available yet.</p>}</section>
  </div></main><SiteFooter /></>;
}
