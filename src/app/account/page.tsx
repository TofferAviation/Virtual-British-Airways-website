import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { getActivePilotBooking, listPilotPireps } from "@/lib/pilot-operations-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pilot account" };

function hoursDisplay(hours: number) {
  const totalMinutes = Math.round(hours * 60);
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}

export default async function AccountPage() {
  const session = await requirePilotSession();
  const account = await getPilotById(session.pilotId);
  if (!account) redirect("/login");
  const [assignment, pireps] = await Promise.all([getActivePilotBooking(account.id), listPilotPireps(account.id)]);
  const tierTarget = 3500;
  const tierProgress = Math.min(100, (account.tierPoints / tierTarget) * 100);
  const stats = [
    { label: "TOTAL FLIGHTS", value: account.flights.toString(), note: "Accepted PIREPs" },
    { label: "FLIGHT TIME", value: hoursDisplay(account.hours), note: "Career block time" },
    { label: "DISTANCE FLOWN", value: account.distanceNm.toLocaleString(), note: "Nautical miles" },
    { label: "AVERAGE LANDING", value: account.averageLanding == null ? "—" : `${account.averageLanding} fpm`, note: "Career average" },
    { label: "BEST LANDING", value: account.bestLanding == null ? "—" : `${account.bestLanding} fpm`, note: "Career best" },
    { label: "ON-TIME RATE", value: `${account.onTime}%`, note: "Completed on schedule" },
    { label: "CURRENT STREAK", value: account.streak.toString(), note: "Flights completed" },
    { label: "CURRENT RANK", value: account.rank, note: "BAV career rank" },
  ];

  return (
    <main className="account-v2-page">
      <header className="account-v2-header">
        <nav className="account-v2-nav" aria-label="Pilot account navigation"><Link href="/destinations">Discover</Link><Link href="/book">Book</Link><Link href="/account">Manage</Link><Link href="/support/tickets">Support</Link></nav>
        <Link className="account-v2-brand" href="/" aria-label="British Airways Virtual home"><BrandLogo variant="white" priority /></Link>
        <div className="account-v2-header-actions"><span className="account-v2-pilot"><span className="account-v2-user-icon" aria-hidden="true" />{account.name}</span><Link href="/api/auth/logout" className="account-v2-logout">Log out</Link><span className="account-v2-avatar" aria-hidden="true" /></div>
      </header>

      <section className="account-v2-hero"><div className="account-v2-container"><p className="account-v2-welcome">Welcome back, {account.name}</p><h1>Your British Airways Virtual account</h1><div className="account-v2-meta"><span className="account-v2-tier-badge">{account.tier} member</span><strong>Pilot ID: {account.pilotNumber}</strong><span className="account-v2-meta-dot">•</span><strong>BAV Operations account</strong></div><div className="account-v2-points" aria-label="Pilot progression summary"><article><span>VA Points</span><strong>{account.points.toLocaleString()}</strong><small>Virtual-airline points earned through your flying</small></article><article><span>Tier points</span><strong>{account.tierPoints.toLocaleString()}</strong><small>Career progression toward your next virtual tier</small></article></div></div></section>

      <nav className="account-v2-tabs" aria-label="Account sections"><div className="account-v2-container account-v2-tabs-inner"><a className="active" href="#trips">Your trips</a><a href="#profile">Your profile</a><a href="#membership">Membership</a><Link href="/support/tickets">Support tickets</Link></div></nav>

      <section className="account-v2-main" id="trips"><div className="account-v2-container"><h2>Your pilot dashboard</h2><p className="account-v2-subtitle">Your career data is maintained directly by British Airways Virtual.</p><div className="account-v2-stat-grid">{stats.map((stat) => <article className="account-v2-stat" key={stat.label}><span className="account-v2-stat-label">{stat.label}</span><strong className="account-v2-stat-value">{stat.value}</strong><small className="account-v2-stat-note">{stat.note}</small></article>)}</div><div className="account-v2-lower">
        <article className="account-v2-card account-v2-flights"><h3>Recent flights</h3><div className="account-v2-flight-list">{pireps.length ? pireps.slice(0, 5).map((pirep) => <div className="account-v2-flight-row" key={pirep.id}><strong>{pirep.flightNumber}</strong><span>{pirep.from} → {pirep.to}</span><span>{pirep.aircraft}</span><span>{Math.floor(pirep.blockMinutes / 60)}h {pirep.blockMinutes % 60}m</span><span>{pirep.landingFpm == null ? "—" : `${pirep.landingFpm} fpm`}</span><span className="account-v2-flight-points">+{pirep.pointsAwarded}</span></div>) : <p className="account-v2-subtitle">No completed BAV PIREPs yet. Your future FreeFlight ACARS flights will appear here automatically.</p>}</div></article>
        <aside className="account-v2-card account-v2-assignment"><h3>Next assignment</h3>{assignment ? <><strong>{assignment.flightNumber} · {assignment.from} → {assignment.to}</strong><p>{assignment.date} · {assignment.aircraft} · {assignment.departure}</p></> : <><strong>No flight booked</strong><p>Choose a flight from the BAV schedule when you&apos;re ready to fly.</p></>}<Link href="/book">Find a virtual flight →</Link><div className="account-v2-tier-box" id="membership"><div className="account-v2-tier-head"><span>Next rank / tier</span><span>{account.tierPoints.toLocaleString()} / {tierTarget.toLocaleString()}</span></div><div className="account-v2-progress" aria-label={`${tierProgress.toFixed(0)} percent progress toward next tier`}><span style={{ width: `${tierProgress}%` }} /></div><p>Tier progression is calculated from BAV flight records.</p></div></aside>
      </div></div></section>

      <footer className="account-v2-footer" id="profile"><div className="account-v2-footer-inner"><div className="account-v2-footer-brand"><BrandLogo variant="white" /></div><div><h4>About</h4><Link href="/about">About the VA</Link><Link href="/fleet">Fleet</Link><Link href="/destinations">Destinations</Link></div><div><h4>Support</h4><Link href="/help">Help</Link><Link href="/support/tickets">Support tickets</Link><Link href="/service-status">Service status</Link></div><div><h4>Operations</h4><Link href="/book">Flights</Link><Link href="/events">Events</Link><Link href="/news">News</Link></div></div></footer>
    </main>
  );
}
