import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { pilot, recentFlights } from "@/lib/mockData";

export const metadata = { title: "Pilot account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  if (cookieStore.get("bav_demo_session")?.value !== "1") {
    redirect("/login");
  }

  const params = await searchParams;
  const assignment = typeof params.assignment === "string" ? params.assignment : "BA267";
  const from = typeof params.from === "string" ? params.from : "LHR";
  const to = typeof params.to === "string" ? params.to : "PDX";
  const tierTarget = 3500;
  const tierProgress = Math.min(100, (pilot.tierPoints / tierTarget) * 100);

  const stats = [
    { label: "TOTAL FLIGHTS", value: pilot.flights.toString(), note: "Accepted PIREPs" },
    { label: "FLIGHT TIME", value: pilot.hoursDisplay, note: "Career block time" },
    { label: "DISTANCE FLOWN", value: pilot.distanceNm.toLocaleString(), note: "Nautical miles" },
    { label: "AVERAGE LANDING", value: `${pilot.averageLanding} fpm`, note: "Career average" },
    { label: "BEST LANDING", value: `${pilot.bestLanding} fpm`, note: "Career best" },
    { label: "ON-TIME RATE", value: `${pilot.onTime}%`, note: "Completed on schedule" },
    { label: "CURRENT STREAK", value: pilot.streak.toString(), note: "Flights completed" },
    { label: "CURRENT RANK", value: pilot.rank, note: "vAMSYS career rank" },
  ];

  return (
    <main className="account-v2-page">
      <header className="account-v2-header">
        <nav className="account-v2-nav" aria-label="Pilot account navigation">
          <Link href="/destinations">Discover</Link>
          <Link href="/book">Book</Link>
          <Link href="/account">Manage</Link>
          <Link href="/help">Help</Link>
        </nav>

        <Link className="account-v2-brand" href="/" aria-label="British Airways Virtual home">
          <BrandLogo variant="white" priority />
        </Link>

        <div className="account-v2-header-actions">
          <span className="account-v2-pilot"><span className="account-v2-user-icon" aria-hidden="true" />Pilot</span>
          <Link href="/api/auth/logout" className="account-v2-logout">Log out</Link>
          <span className="account-v2-avatar" aria-hidden="true" />
        </div>
      </header>

      <section className="account-v2-hero">
        <div className="account-v2-container">
          <p className="account-v2-welcome">Welcome back, {pilot.name}</p>
          <h1>Your British Airways Virtual account</h1>

          <div className="account-v2-meta">
            <span className="account-v2-tier-badge">{pilot.tier} member</span>
            <strong>Pilot ID: {pilot.id}</strong>
            <span className="account-v2-meta-dot">•</span>
            <strong>vAMSYS / Phoenix linked</strong>
          </div>

          <div className="account-v2-points" aria-label="Pilot progression summary">
            <article>
              <span>VA Points</span>
              <strong>{pilot.points.toLocaleString()}</strong>
              <small>Virtual-airline points earned through your flying</small>
            </article>
            <article>
              <span>Tier points</span>
              <strong>{pilot.tierPoints.toLocaleString()}</strong>
              <small>Career progression toward your next virtual tier</small>
            </article>
          </div>
        </div>
      </section>

      <nav className="account-v2-tabs" aria-label="Account sections">
        <div className="account-v2-container account-v2-tabs-inner">
          <a className="active" href="#trips">Your trips</a>
          <a href="#profile">Your profile</a>
          <a href="#membership">Membership</a>
        </div>
      </nav>

      <section className="account-v2-main" id="trips">
        <div className="account-v2-container">
          <h2>Your pilot dashboard</h2>
          <p className="account-v2-subtitle">The website view of the same career information that can later be synchronized with Phoenix.</p>

          <div className="account-v2-stat-grid">
            {stats.map((stat) => (
              <article className="account-v2-stat" key={stat.label}>
                <span className="account-v2-stat-label">{stat.label}</span>
                <strong className="account-v2-stat-value">{stat.value}</strong>
                <small className="account-v2-stat-note">{stat.note}</small>
              </article>
            ))}
          </div>

          <div className="account-v2-lower">
            <article className="account-v2-card account-v2-flights">
              <h3>Recent flights</h3>
              <div className="account-v2-flight-list">
                {recentFlights.map((flight) => (
                  <div className="account-v2-flight-row" key={`${flight.flight}-${flight.date}`}>
                    <strong>{flight.flight}</strong>
                    <span>{flight.route}</span>
                    <span>{flight.aircraft}</span>
                    <span>{flight.duration}</span>
                    <span>{flight.landing} fpm</span>
                    <span className="account-v2-flight-points">+{flight.points}</span>
                  </div>
                ))}
              </div>
            </article>

            <aside className="account-v2-card account-v2-assignment">
              <h3>Next assignment</h3>
              <strong>{assignment} · {from} → {to}</strong>
              <p>2026-09-06 · Boeing 787-9 · 15:30</p>
              <Link href="/book">Find a virtual flight →</Link>

              <div className="account-v2-tier-box" id="membership">
                <div className="account-v2-tier-head">
                  <span>Next rank / tier</span>
                  <span>{pilot.tierPoints.toLocaleString()} / {tierTarget.toLocaleString()}</span>
                </div>
                <div className="account-v2-progress" aria-label={`${tierProgress.toFixed(0)} percent progress toward next tier`}>
                  <span style={{ width: `${tierProgress}%` }} />
                </div>
                <p>Tier points are intended to come from vAMSYS career data.</p>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <footer className="account-v2-footer" id="profile">
        <div className="account-v2-footer-inner">
          <div className="account-v2-footer-brand">
            <BrandLogo variant="white" />
          </div>
          <div>
            <h4>About</h4>
            <Link href="/">About the VA</Link>
            <Link href="/fleet">Fleet</Link>
            <Link href="/destinations">Destinations</Link>
          </div>
          <div>
            <h4>Support</h4>
            <Link href="/help">Help</Link>
            <a href="#">Discord</a>
            <a href="#">Operations manual</a>
          </div>
          <div>
            <h4>More</h4>
            <Link href="/book">Flights</Link>
            <a href="#">Phoenix</a>
            <a href="https://vamsys.io" rel="noreferrer">vAMSYS</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
