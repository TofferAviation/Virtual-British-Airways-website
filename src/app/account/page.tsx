import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { RankInsignia } from "@/components/RankInsignia";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getActiveAcarsSessionForPilot } from "@/lib/acars-store";
import { getActivePilotBooking, getPilotFlightPlan, listPilotPireps } from "@/lib/pilot-operations-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById, getRewardSettings, unreadPilotNotificationCount } from "@/lib/pilot-store";
import { formatPilotTypeRatings, nextPilotRank } from "@/lib/pilot-ranks";
import { getPilotAwardDisplay } from "@/lib/pilot-awards";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pilot account" };

function hoursDisplay(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}

function trackingIsFresh(updatedAt: string) {
  return Date.now() - new Date(updatedAt).getTime() <= 90_000;
}

export default async function AccountPage() {
  const session = await requirePilotSession();
  const account = await getPilotById(session.pilotId);
  if (!account) redirect("/login");
  const [assignment, pireps, rewardSettings, activeAcars, unreadNotifications] = await Promise.all([
    getActivePilotBooking(account.id),
    listPilotPireps(account.id),
    getRewardSettings(),
    // An unavailable telemetry source must never prevent a pilot from opening
    // their account. Ember will report its state again as soon as it reconnects.
    getActiveAcarsSessionForPilot(account.id).catch(() => null),
    unreadPilotNotificationCount(account.id),
  ]);
  const flightPlan = assignment ? await getPilotFlightPlan(assignment.id, account.id) : null;
  const tierTarget = rewardSettings.tierGoldThreshold;
  const tierProgress = Math.min(100, (account.tierPoints / tierTarget) * 100);
  const nextRank = nextPilotRank(account.hours);
  const typeRatingSummary = formatPilotTypeRatings(account.typeRatings);
  const careerAwards = account.awards
    .map((award) => ({ award, detail: getPilotAwardDisplay(award) }))
    .sort((left, right) => left.detail.order - right.detail.order || left.award.awardedAt.localeCompare(right.award.awardedAt));
  const relatedPirep = assignment ? pireps.find((pirep) => pirep.bookingId === assignment.id) ?? null : null;
  const trackedAssignment = activeAcars && assignment && activeAcars.bookingId === assignment.id ? activeAcars : null;
  const trackingFresh = trackedAssignment ? trackingIsFresh(trackedAssignment.updatedAt) : false;
  const stats = [
    { label: "TOTAL FLIGHTS", value: account.flights.toString(), note: "Accepted PIREPs" },
    { label: "FLIGHT TIME", value: hoursDisplay(account.hours), note: "Career block time" },
    { label: "DISTANCE FLOWN", value: account.distanceNm.toLocaleString(), note: "Nautical miles" },
    { label: "AVERAGE LANDING", value: account.averageLanding == null ? "—" : `${account.averageLanding} fpm`, note: "Career average" },
    { label: "BEST LANDING", value: account.bestLanding == null ? "—" : `${account.bestLanding} fpm`, note: "Career best" },
    { label: "ON-TIME RATE", value: `${account.onTime}%`, note: "Completed on schedule" },
    { label: "CURRENT STREAK", value: account.streak.toString(), note: "Flights completed" },
    { label: "CURRENT RANK", value: account.rank, note: nextRank ? `${Math.max(0, nextRank.minimumHours - account.hours).toFixed(1)} h to ${nextRank.rank}` : "Highest automatic BAV rank" },
    { label: "LONG-HAUL QUALIFICATIONS", value: account.typeRatings.length.toString(), note: typeRatingSummary },
  ];

  return (
    <main className="account-v2-page">
      <header className="account-v2-header">
        <nav className="account-v2-nav" aria-label="Pilot account navigation"><Link href="/destinations">Discover</Link><Link href="/book">Book</Link><Link href="/account">Manage</Link><Link href="/support/tickets">Support</Link></nav>
        <Link className="account-v2-brand" href="/" aria-label="British Airways Virtual home"><BrandLogo variant="white" priority /></Link>
        <div className="account-v2-header-actions"><span className="account-v2-pilot"><span className="account-v2-user-icon" aria-hidden="true" />{account.name}</span><ThemeToggle /><Link href="/api/auth/logout" className="account-v2-logout">Log out</Link><span className="account-v2-avatar" aria-hidden="true" /></div>
      </header>

      <section className="account-v2-hero" style={account.accountBackground ? { backgroundImage: `linear-gradient(100deg, rgba(7, 49, 112, .48) 0%, rgba(8, 72, 150, .32) 52%, rgba(8, 43, 94, .5) 100%), url(${account.accountBackground})` } : undefined}><div className="account-v2-container"><p className="account-v2-welcome">Welcome back, {account.name}</p><h1>Your British Airways Virtual account</h1><div className="account-v2-meta"><span className="account-v2-tier-badge">{account.tier} member</span><strong>Pilot ID: {account.pilotNumber}</strong><span className="account-v2-meta-dot">•</span><strong>BAV Operations account</strong></div><div className="account-v2-points" aria-label="Pilot progression summary"><article><span>VA Points</span><strong>{account.points.toLocaleString()}</strong><small>Virtual-airline points earned through your flying</small></article><article><span>Tier points</span><strong>{account.tierPoints.toLocaleString()}</strong><small>Career progression toward your next virtual tier</small></article></div></div></section>

      <nav className="account-v2-tabs" aria-label="Account sections"><div className="account-v2-container account-v2-tabs-inner"><a className="active" href="#trips">Your trips</a><Link href="/account/notifications">Notifications{unreadNotifications ? <span className="account-v2-notification-count">{unreadNotifications}</span> : null}</Link><Link href="/account/profile">Account settings</Link><Link href="/handbook">Handbook</Link><a href="#membership">Membership</a><Link href="/support/tickets">Support tickets</Link></div></nav>

      <section className="account-v2-main" id="trips"><div className="account-v2-container"><h2>Your pilot dashboard</h2><p className="account-v2-subtitle">Your career data is maintained directly by British Airways Virtual.</p><section className="account-v2-readiness" aria-label="Flight readiness">
        <header><div><span>YOUR NEXT BAV FLIGHT</span><h3>{assignment ? `${assignment.flightNumber} · ${assignment.from} → ${assignment.to}` : "Ready when you are"}</h3></div>{assignment ? <Link href="/manage-assignment">Open flight desk →</Link> : <Link href="/book">Find a flight →</Link>}</header>
        <div className="account-v2-readiness-grid">
          <article className={assignment ? "complete" : "action"}><i aria-hidden="true">1</i><div><span>ASSIGNMENT</span><strong>{assignment ? "Flight selected" : "Choose a BAV flight"}</strong><small>{assignment ? `${assignment.aircraft} · ${assignment.date} · ${assignment.departure}` : "Start with the live BAV schedule."}</small></div></article>
          <article className={!assignment ? "waiting" : flightPlan?.status === "synced" ? "complete" : "action"}><i aria-hidden="true">2</i><div><span>SIMBRIEF</span><strong>{!assignment ? "Waiting for a flight" : flightPlan?.status === "synced" ? "Briefing synced" : "Prepare your briefing"}</strong><small>{!assignment ? "Your selected service will appear here." : flightPlan?.status === "synced" ? `OFP ${flightPlan.simbriefOfpId ? `#${flightPlan.simbriefOfpId}` : "saved to assignment"}` : "Generate or sync the current OFP."}</small></div></article>
          <article className={!assignment ? "waiting" : trackedAssignment && trackingFresh ? "complete" : trackedAssignment ? "action" : "waiting"}><i aria-hidden="true">3</i><div><span>EMBER &amp; BA-RADAR</span><strong>{!assignment ? "Waiting for a flight" : trackedAssignment && trackingFresh ? "Tracking live" : trackedAssignment ? "Connection needs attention" : "Open Ember when ready"}</strong><small>{!assignment ? "Ember connects only to an active BAV assignment." : trackedAssignment && trackingFresh ? `${trackedAssignment.simulator === "xplane12" ? "X-Plane 12" : trackedAssignment.simulator === "msfs2024" ? "MSFS 2024" : "MSFS 2020"} · live telemetry received` : trackedAssignment ? "Ember has not reported for more than 90 seconds." : "Sign in, refresh the flight and connect your simulator."}</small></div></article>
          <article className={!assignment ? "waiting" : relatedPirep ? "complete" : "waiting"}><i aria-hidden="true">4</i><div><span>FLIGHT REPORT</span><strong>{!assignment ? "Waiting for a flight" : relatedPirep ? relatedPirep.status.replaceAll("_", " ") : "PIREP will be automatic"}</strong><small>{!assignment ? "A linked PIREP is created after an Ember flight." : relatedPirep ? "This flight report is now in the BAV review flow." : "After shutdown, Ember submits the linked PIREP for review."}</small></div></article>
        </div>
        {assignment && !trackedAssignment ? <p className="account-v2-readiness-help">Need Ember? <Link href="/account/profile">Download or open Ember access</Link>. Only use the manual PIREP if an Ember flight cannot be completed.</p> : null}
      </section><div className="account-v2-stat-grid">{stats.map((stat) => <article className="account-v2-stat" key={stat.label}><span className="account-v2-stat-label">{stat.label}</span><strong className={`account-v2-stat-value${stat.label === "CURRENT RANK" ? " account-v2-rank-value" : ""}`}>{stat.label === "CURRENT RANK" ? <><RankInsignia rank={account.rank} size="compact" /><span>{stat.value}</span></> : stat.value}</strong><small className="account-v2-stat-note">{stat.note}</small></article>)}</div>{careerAwards.length ? <section className="account-v2-awards" aria-label="Career awards">{careerAwards.map(({ award, detail }) => <article className="account-v2-award" key={`${award.id}-${award.eventId ?? "career"}`}><span className="account-v2-award-mark" aria-hidden="true">★</span><div><span className="account-v2-award-kicker">CAREER AWARD · {detail.criterion.toUpperCase()}</span><strong>{detail.title}</strong><p>Earned {new Date(award.awardedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} · {detail.description}</p></div></article>)}</section> : null}<div className="account-v2-lower">
        <article className="account-v2-card account-v2-flights"><h3>Recent flight reports</h3><div className="account-v2-flight-list">{pireps.length ? pireps.slice(0, 5).map((pirep) => <div className="account-v2-flight-row" key={pirep.id}><Link className="account-v2-flight-debrief" href={`/account/flights/${encodeURIComponent(pirep.id)}`}><strong>{pirep.flightNumber}</strong><small>Open debrief</small></Link><span>{pirep.from} → {pirep.to}</span><span>{pirep.aircraft}</span><span>{Math.floor(pirep.blockMinutes / 60)}h {pirep.blockMinutes % 60}m</span><span>{pirep.landingFpm == null ? "—" : `${pirep.landingFpm} fpm`}</span><span className={`ops-pirep-chip ${pirep.status}`}>{pirep.status.replaceAll("_", " ")}</span></div>) : <p className="account-v2-subtitle">No BAV PIREPs yet. Completed Ember ACARS flights and manual fallback reports appear here for review.</p>}</div></article>
        <aside className="account-v2-card account-v2-assignment"><h3>Active assignment</h3>{assignment ? <><strong>{assignment.flightNumber} · {assignment.from} → {assignment.to}</strong><p>{assignment.date} · {assignment.aircraft} · {assignment.departure}</p>{flightPlan ? <p><b>Flight plan:</b> {flightPlan.status === "synced" ? `SimBrief OFP ${flightPlan.simbriefOfpId ? `#${flightPlan.simbriefOfpId}` : "synced"}` : "Briefing not yet synced"}</p> : null}<Link className="ops-inline-link" href="/manage-assignment">Manage assignment & view briefing →</Link><Link className="ops-inline-link" href="/operations/pirep">Manual PIREP fallback →</Link></> : <><strong>No flight booked</strong><p>Choose a flight from the BAV schedule when you&apos;re ready to fly.</p></>}<Link href="/book">Find a virtual flight →</Link><div className="account-v2-tier-box" id="membership"><div className="account-v2-tier-head"><span>Next rank / tier</span><span>{account.tierPoints.toLocaleString()} / {tierTarget.toLocaleString()}</span></div><div className="account-v2-progress" aria-label={`${tierProgress.toFixed(0)} percent progress toward next tier`}><span style={{ width: `${tierProgress}%` }} /></div><p>Tier progression is calculated from accepted BAV flight records.</p></div></aside>
      </div></div></section>

      <footer className="account-v2-footer"><div className="account-v2-footer-inner"><div className="account-v2-footer-brand"><BrandLogo variant="white" /></div><div><h4>About</h4><Link href="/about">About the VA</Link><Link href="/fleet">Fleet</Link><Link href="/destinations">Destinations</Link></div><div><h4>Support</h4><Link href="/handbook">BAV Handbook</Link><Link href="/support/tickets">Support tickets</Link><Link href="/service-status">Service status</Link></div><div><h4>Account</h4><Link href="/account/profile">Account settings</Link><Link href="/book">Flights</Link><Link href="/operations/pirep">Manual PIREP fallback</Link></div></div></footer>
    </main>
  );
}
