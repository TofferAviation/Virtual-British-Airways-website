import Image from "next/image";
import Link from "next/link";
import { pilot, recentFlights } from "@/lib/mockData";

export const metadata = { title: "Pilot account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const assignment = typeof params.assignment === "string" ? params.assignment : "BA117";
  const from = typeof params.from === "string" ? params.from : "LHR";
  const to = typeof params.to === "string" ? params.to : "JFK";

  return (
    <main className="account-page">
      <header className="account-header">
        <nav className="account-header-nav">
          <Link href="/">Home</Link>
          <Link href="/book">Book</Link>
          <Link href="/help">Help</Link>
        </nav>
        <Link className="account-brand" href="/">
          <Image src="/branding/ba-virtual-logo-white.svg" alt="British Airways Virtual" width={360} height={176} priority />
        </Link>
        <div className="account-header-actions">
          <span>{pilot.id}</span>
          <span className="account-avatar" aria-hidden="true" />
        </div>
      </header>

      <section className="account-hero">
        <div className="account-hero-inner">
          <div>
            <div className="section-kicker account-kicker">Pilot account</div>
            <h1>Welcome back, {pilot.name}</h1>
            <p>{pilot.rank} · {pilot.hub} · vAMSYS/Phoenix connection placeholder</p>
          </div>
          <div className="account-points-summary">
            <div><strong>{pilot.points.toLocaleString()}</strong><span>VA Points</span></div>
            <div><strong>{pilot.tierPoints.toLocaleString()}</strong><span>Tier Points</span></div>
            <div><strong>{pilot.tier}</strong><span>Membership tier</span></div>
          </div>
        </div>
      </section>

      <nav className="account-tabs">
        <div className="account-tabs-inner">
          <a className="active" href="#overview">Overview</a>
          <a href="#flights">My flights</a>
          <a href="#profile">Profile</a>
          <a href="#membership">Membership</a>
        </div>
      </nav>

      <section className="account-content" id="overview">
        <div className="account-stat-grid">
          <article><span>Total flights</span><strong>{pilot.flights}</strong></article>
          <article><span>Flight hours</span><strong>{pilot.hours.toFixed(1)}</strong></article>
          <article><span>Distance flown</span><strong>{pilot.distanceNm.toLocaleString()} nm</strong></article>
          <article><span>Average landing</span><strong>{pilot.averageLanding} fpm</strong></article>
          <article><span>Best landing</span><strong>{pilot.bestLanding} fpm</strong></article>
          <article><span>On-time rate</span><strong>{pilot.onTime}%</strong></article>
          <article><span>Flight streak</span><strong>{pilot.streak}</strong></article>
          <article><span>Current rank</span><strong>{pilot.rank}</strong></article>
        </div>

        <div className="account-two-column">
          <article className="account-panel next-assignment">
            <div className="section-kicker">Next assignment</div>
            <h2>{assignment}</h2>
            <div className="assignment-route"><strong>{from}</strong><span>→</span><strong>{to}</strong></div>
            <p>Your selected website assignment will later sync into Phoenix through the shared backend.</p>
            <Link className="button button-primary" href="/book">Change assignment</Link>
          </article>

          <article className="account-panel membership-panel" id="membership">
            <div className="section-kicker">Virtual membership</div>
            <h2>{pilot.tier} tier</h2>
            <p>{pilot.tierPoints.toLocaleString()} Tier Points earned this membership year.</p>
            <div className="tier-progress"><span style={{ width: `${Math.min(100, (pilot.tierPoints / 1500) * 100)}%` }} /></div>
            <div className="tier-labels"><span>Blue</span><strong>Bronze at 1,500</strong></div>
            <p className="small-copy">Lifetime Tier Points: {pilot.lifetimeTierPoints.toLocaleString()}</p>
          </article>
        </div>

        <article className="account-panel" id="flights">
          <div className="panel-heading-row">
            <div><div className="section-kicker">Flight history</div><h2>Recent flights</h2></div>
            <Link href="/book">Book another flight</Link>
          </div>
          <div className="flight-history-table">
            <div className="flight-history-head"><span>Flight</span><span>Route</span><span>Aircraft</span><span>Date</span><span>Landing</span><span>VA Points</span></div>
            {recentFlights.map((flight) => (
              <div className="flight-history-row" key={`${flight.flight}-${flight.date}`}>
                <strong>{flight.flight}</strong><span>{flight.route}</span><span>{flight.aircraft}</span><span>{flight.date}</span><span>{flight.landing} fpm</span><span>+{flight.points}</span>
              </div>
            ))}
          </div>
        </article>

        <div className="account-two-column" id="profile">
          <article className="account-panel">
            <div className="section-kicker">Your profile</div>
            <h2>Connected services</h2>
            <div className="profile-list">
              <div><span>vAMSYS</span><strong>Connection pending API/SSO</strong></div>
              <div><span>Phoenix</span><strong>Shared stats contract planned</strong></div>
              <div><span>SimBrief</span><strong>Not connected</strong></div>
              <div><span>Preferred hub</span><strong>{pilot.hub}</strong></div>
            </div>
          </article>
          <article className="account-panel">
            <div className="section-kicker">Career progression</div>
            <h2>VA Points</h2>
            <div className="huge-points">{pilot.points.toLocaleString()}</div>
            <p>These are virtual-airline points only. They are not Avios and have no real-world monetary value.</p>
            <Link className="text-link" href="/help">View points framework</Link>
          </article>
        </div>
      </section>

      <footer className="account-footer">
        <Image src="/branding/ba-virtual-logo-white.svg" alt="British Airways Virtual" width={360} height={176} />
        <div className="account-footer-links"><Link href="/help">Help</Link><Link href="/">Home</Link><a href="#">Privacy</a><a href="#">Terms</a></div>
        <p>British Airways Virtual · Flight simulation only · Not affiliated with British Airways Plc</p>
      </footer>
    </main>
  );
}
