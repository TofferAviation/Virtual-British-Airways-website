import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { isCareerFeatureEnabled } from "@/lib/career-experience";
import { getCareerDashboard } from "@/lib/pilot-career";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotAwardDisplay } from "@/lib/pilot-awards";
import { getPilotById } from "@/lib/pilot-store";
import { listPilotPireps } from "@/lib/pilot-operations-store";
import { getPilotAircraftPassport } from "@/lib/fleet-service";
import styles from "./Passport.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Career Passport" };

function blockTime(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function date(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default async function CareerPassportPage() {
  if (!isCareerFeatureEnabled("passport")) notFound();
  const session = await requirePilotSession();
  const pilot = await getPilotById(session.pilotId);
  if (!pilot) redirect("/login");
  const [career, pireps, aircraftPassport] = await Promise.all([getCareerDashboard(pilot), listPilotPireps(pilot.id), getPilotAircraftPassport(pilot.id)]);
  const accepted = pireps.filter((pirep) => pirep.status === "accepted").sort((left, right) => left.completedAt.localeCompare(right.completedAt));
  const blockMinutes = accepted.reduce((total, flight) => total + Math.max(0, flight.blockMinutes), 0);
  const distanceNm = accepted.reduce((total, flight) => total + Math.max(0, flight.distanceNm), 0);
  const destinations = [...new Set(accepted.map((flight) => flight.to))].sort();
  const qualifications = career.qualifications.filter((qualification) => ["valid", "expiring_soon", "recurrent_due"].includes(qualification.status));
  const timeline = [
    { at: pilot.createdAt, title: "Joined British Airways Virtual", detail: "Your virtual Career Passport began." },
    ...qualifications.map((qualification) => ({ at: qualification.issuedAt, title: career.definitions.find((definition) => definition.id === qualification.qualificationDefinitionId)?.name ?? qualification.qualificationDefinitionId, detail: `Virtual qualification recorded · ${qualification.status.replaceAll("_", " ")}.` })),
    ...pilot.awards.map((award) => ({ at: award.awardedAt, title: getPilotAwardDisplay(award).title, detail: getPilotAwardDisplay(award).description })),
    ...accepted.slice(-6).map((flight) => ({ at: flight.completedAt, title: `${flight.flightNumber} · ${flight.from} → ${flight.to}`, detail: `${flight.aircraft} · ${blockTime(flight.blockMinutes)} · ${flight.distanceNm.toLocaleString("en-GB")} NM.` })),
  ].sort((left, right) => right.at.localeCompare(left.at)).slice(0, 12);
  const experience = [...new Map(accepted.map((flight) => [flight.aircraft, accepted.filter((item) => item.aircraft === flight.aircraft)])).entries()].map(([aircraft, flights]) => ({ aircraft, flights: flights.length, minutes: flights.reduce((total, flight) => total + flight.blockMinutes, 0), distance: flights.reduce((total, flight) => total + flight.distanceNm, 0) })).sort((left, right) => right.minutes - left.minutes).slice(0, 6);
  const firstFlight = accepted[0] ?? null;
  const latestFlight = accepted.at(-1) ?? null;

  return <><SiteHeader /><main className="career-page"><div className="career-shell">
    <nav className="career-breadcrumbs"><Link href="/account">Pilot account</Link><span>›</span><Link href="/account/career">Career</Link><span>›</span><strong>Career Passport</strong></nav>
    <header className={styles.hero}><div><span>BRITISH AIRWAYS VIRTUAL · CAREER PASSPORT</span><h1>{pilot.name}&apos;s virtual flying story</h1><p>A personal record of your accepted BAV flying, awards and virtual qualifications. This is a BAV simulation history, not a real-world logbook, employment record or certification.</p></div><div><small>PILOT ID</small><strong>{pilot.pilotNumber}</strong><span>Member since {date(pilot.createdAt)}</span></div></header>
    <section className={styles.summary} aria-label="Career Passport summary"><article><span>Accepted flights</span><strong>{accepted.length}</strong><small>{blockTime(blockMinutes)} block time</small></article><article><span>Destinations</span><strong>{destinations.length}</strong><small>{distanceNm.toLocaleString("en-GB")} NM recorded</small></article><article><span>Career awards</span><strong>{pilot.awards.length}</strong><small>{pilot.points.toLocaleString("en-GB")} VA Points</small></article><article><span>Qualifications</span><strong>{qualifications.length}</strong><small>Current virtual records</small></article></section>
    <section className={styles.journeys}><article><span>FIRST ACCEPTED FLIGHT</span>{firstFlight ? <><h2>{firstFlight.flightNumber} · {firstFlight.from} → {firstFlight.to}</h2><p>{date(firstFlight.completedAt)} · {firstFlight.aircraft} · {blockTime(firstFlight.blockMinutes)} · {firstFlight.distanceNm.toLocaleString("en-GB")} NM.</p></> : <p>Your first accepted BAV PIREP will become the first stamp in this Passport.</p>}</article><article><span>LATEST ACCEPTED FLIGHT</span>{latestFlight ? <><h2>{latestFlight.flightNumber} · {latestFlight.from} → {latestFlight.to}</h2><p>{date(latestFlight.completedAt)} · {latestFlight.aircraft} · {blockTime(latestFlight.blockMinutes)} · {latestFlight.distanceNm.toLocaleString("en-GB")} NM.</p></> : <p>Once a BAV PIREP is accepted, your latest journey will appear here.</p>}</article></section>
    <section id="aircraft-passport" className={styles.aircraftPassport}><div className={styles.aircraftPassportHeading}><div><span>AIRCRAFT PASSPORT · REGISTRATION COLLECTION</span><h2>Aircraft you have flown</h2><p>Each registration is derived from an accepted BAV PIREP linked to its completed Ember session. It does not create or alter a separate flight record.</p></div><strong>{aircraftPassport.registrations.length} collected</strong></div>{aircraftPassport.collections.length ? <div className={styles.collections}>{aircraftPassport.collections.map((collection) => <div key={collection.aircraftModel}><strong>{collection.collected} / {collection.fleetTotal}</strong><span>{collection.aircraftModel}</span><small>Current BAV fleet collection</small></div>)}</div> : null}{aircraftPassport.registrations.length ? <div className={styles.aircraftRegistrations}>{aircraftPassport.registrations.map((aircraft) => <Link key={aircraft.registration} href={`/fleet/${encodeURIComponent(aircraft.registration)}`}><strong>{aircraft.registration}</strong><span>{aircraft.aircraftModel ?? "Historical BAV airframe"}</span><small>{aircraft.flights} accepted sector{aircraft.flights === 1 ? "" : "s"} · {blockTime(aircraft.blockMinutes)} · {Math.round(aircraft.distanceNm).toLocaleString("en-GB")} NM{aircraft.activeFleetRecord ? aircraft.currentStation ? ` · ${aircraft.currentStation}` : " · Active fleet record" : " · Historical record"}</small></Link>)}</div> : <p>Your accepted flights will add aircraft registrations here automatically.</p>}</section>
    <section className={styles.grid}><article><span>CAREER TIMELINE</span><h2>Milestones so far</h2><div className={styles.timeline}>{timeline.map((milestone, index) => <div key={`${milestone.title}-${milestone.at}-${index}`}><time>{date(milestone.at)}</time><p><strong>{milestone.title}</strong><small>{milestone.detail}</small></p></div>)}</div></article><article><span>AIRCRAFT EXPERIENCE</span><h2>Your most-flown types</h2>{experience.length ? <div className={styles.experience}>{experience.map((item) => <div key={item.aircraft}><strong>{item.aircraft}</strong><span>{item.flights} sectors · {blockTime(item.minutes)} · {item.distance.toLocaleString("en-GB")} NM</span></div>)}</div> : <p>No accepted aircraft experience has been recorded yet.</p>}</article></section>
    <section className={styles.destinations}><span>DESTINATION STAMPS</span><h2>Places you have reached</h2>{destinations.length ? <div>{destinations.map((destination) => <b key={destination}>{destination}</b>)}</div> : <p>Accepted BAV flights will add destination stamps here automatically.</p>}</section>
  </div></main><SiteFooter /></>;
}
