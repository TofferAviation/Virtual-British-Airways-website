import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { pilot } from "@/lib/mockData";

export const metadata: Metadata = {
  title: "Tier Points",
  description: "How Tier Points work, how they are earned and status progression in British Airways Virtual.",
};

function FlightIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M9 25.5 40 10l-2.8 6.8-9.5 6.6-3.8 14.5-4.2 2.1-1.2-12-6.3 3.7-3.2 6-2.6 1.2.7-7.3-5.2-4.5L9 25.5Z" />
    </svg>
  );
}

function CoinsIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <ellipse cx="24" cy="13" rx="10" ry="5" />
      <path d="M14 13v7c0 2.8 4.5 5 10 5s10-2.2 10-5v-7M14 20v7c0 2.8 4.5 5 10 5s10-2.2 10-5v-7M14 27v7c0 2.8 4.5 5 10 5s10-2.2 10-5v-7" />
    </svg>
  );
}

function BarsIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M9 39V27h7v12H9Zm12 0V18h7v21h-7Zm12 0V9h7v30h-7Z" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M16 10h16v8c0 8-3.5 13-8 13s-8-5-8-13v-8Z" />
      <path d="M16 14H9v4c0 5 3 8 8 8M32 14h7v4c0 5-3 8-8 8M24 31v6M17 40h14" />
    </svg>
  );
}

function GiftIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 20h32v20H8V20Zm-2-7h36v8H6v-8ZM24 13v27" />
      <path d="M24 13c-8 0-11-2-11-5 0-2.2 1.8-4 4-4 4.2 0 7 9 7 9Zm0 0c8 0 11-2 11-5 0-2.2-1.8-4-4-4-4.2 0-7 9-7 9Z" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M11 35c7-10 13-16 26-22M10 16a5 5 0 1 0 10 0 5 5 0 0 0-10 0Zm23 16a5 5 0 1 0 10 0 5 5 0 0 0-10 0Z" />
      <path d="M15 21v8M38 37v4" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="16" />
      <path d="M8 24h32M24 8c6 6 8 11 8 16s-2 10-8 16M24 8c-6 6-8 11-8 16s2 10 8 16" />
    </svg>
  );
}

function HeroGraphic() {
  return (
    <svg className="vap-hero-art" viewBox="0 0 760 300" role="img" aria-label="Tier Points global route illustration">
      <g className="vap-map" opacity=".26">
        <path d="M72 124 101 95l35-9 24-24 31 8 17-23 38 8 16 28 34 15-5 30-38 8-19 23-34-2-16 15-35-11-20-31-37-6Z" />
        <path d="M323 76 354 49l48 5 26 20 31 2 26 21-8 26-31 15-8 39-28 40-31-8-20-34-33-14-19-29 16-23Z" />
        <path d="M518 105 555 84l50 5 37 18 45 0 26 19-15 27-42 5-19 24-42-1-28 21-40-8-11-29-34-18 10-25Z" />
      </g>
      <path className="vap-route" d="M118 142C205 53 285 58 352 123" />
      <path className="vap-route" d="M407 132C504 55 590 61 676 101" />
      <path className="vap-route" d="M133 150C210 220 300 214 356 164" />
      <circle className="vap-route-dot" cx="119" cy="143" r="6" />
      <circle className="vap-route-dot" cx="589" cy="151" r="6" />
      <g className="vap-plane" transform="translate(674 84) rotate(-18)">
        <path d="M0 10 37 0l-8 8 15 6-4 4-18-3-10 12-5-2 4-13-11 2Z" />
      </g>
      <circle className="vap-badge-outer" cx="378" cy="145" r="79" />
      <circle className="vap-badge-inner" cx="378" cy="145" r="68" />
      <text className="vap-badge-text tp-badge-text" x="378" y="137" textAnchor="middle">TIER</text>
      <text className="vap-badge-text tp-badge-text" x="378" y="166" textAnchor="middle">POINTS</text>
      <path className="vap-speedmarque-red" d="M349 188h58l-24 7Z" />
      <path className="vap-speedmarque-blue" d="M383 195h23l-15 6Z" />
      <text className="vap-hero-tag" x="614" y="164">Status built</text>
      <text className="vap-hero-tag" x="614" y="187">through flying</text>
      <path className="vap-tag-line" d="M614 207h50" />
    </svg>
  );
}

const earningRows = [
  ["Domestic / short sector", "5 TP"],
  ["European short haul economy", "10 TP"],
  ["European short haul business", "20 TP"],
  ["Long-haul economy", "35 TP"],
  ["Long-haul premium cabin", "60 TP"],
  ["Special event / challenge bonus", "+10 TP"],
];

const statusBands = [
  ["Blue", "0 to 149", "blue"],
  ["Bronze", "150 to 399", "bronze"],
  ["Silver", "400 to 799", "silver"],
  ["Gold", "800+", "gold"],
];

const examples = [
  { icon: "flight", title: "London Heathrow to Manchester", points: "5 Tier Points", note: "A domestic short sector within the UK." },
  { icon: "route", title: "London Heathrow to Madrid in Club Europe", points: "20 Tier Points", note: "A European short haul flight in business class." },
  { icon: "globe", title: "London Heathrow to New York in Club World", points: "60 Tier Points", note: "A long-haul transatlantic flight in premium cabin." },
];

export default async function TierPointsPage() {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.get("bav_demo_session")?.value === "1";
  const currentPoints = isLoggedIn ? pilot.tierPoints : 372;

  const currentBand = currentPoints < 150 ? "Blue" : currentPoints < 400 ? "Bronze" : currentPoints < 800 ? "Silver" : "Gold";
  const lowerThreshold = currentPoints < 150 ? 0 : currentPoints < 400 ? 150 : currentPoints < 800 ? 400 : 800;
  const nextThreshold = currentPoints < 150 ? 150 : currentPoints < 400 ? 400 : currentPoints < 800 ? 800 : null;
  const nextBand = currentPoints < 150 ? "Bronze" : currentPoints < 400 ? "Silver" : currentPoints < 800 ? "Gold" : "Gold";
  const pointsToNext = nextThreshold ? Math.max(0, nextThreshold - currentPoints) : 0;
  const progress = nextThreshold ? Math.max(0, Math.min(100, ((currentPoints - lowerThreshold) / (nextThreshold - lowerThreshold)) * 100)) : 100;

  return (
    <>
      <SiteHeader />
      <main className="vap-page tp-page">
        <div className="vap-breadcrumbs">
          <Link href="/">Home</Link><span>›</span>
          <Link href="/about">British Airways Virtual</Link><span>›</span>
          <Link href="/destinations">Discover</Link><span>›</span>
          <strong>Tier Points</strong>
        </div>

        <section className="vap-hero">
          <div className="vap-shell vap-hero-grid">
            <div className="vap-hero-copy">
              <span className="vap-kicker">Tier Points</span>
              <h1>Progress through status<br />tiers with every journey.</h1>
              <p>
                Tier Points measure your eligible flying activity across British Airways Virtual. They help pilots move
                through status bands and reflect your long-term progression within British Airways Virtual.
              </p>
            </div>
            <HeroGraphic />
          </div>
        </section>

        <nav className="vap-section-nav" aria-label="Tier Points sections">
          <a className="active" href="#overview">Overview</a>
          <a href="#earn">How to earn</a>
          <a href="#bands">Status bands</a>
          <a href="#examples">Examples</a>
        </nav>

        <section className="vap-how vap-shell" id="overview">
          <span className="vap-kicker">How it works</span>
          <h2>How Tier Points work</h2>
          <p className="vap-lead">
            Tier Points are awarded for eligible flights across British Airways Virtual. They are calculated automatically
            based on your journey type, route and cabin class, and help you progress through the status bands.
          </p>
          <div className="vap-steps">
            <article>
              <div className="vap-icon"><FlightIcon /></div>
              <div><h3>1. Fly eligible routes</h3><p>Operate qualifying flights across the British Airways Virtual network and partner routes.</p></div>
            </article>
            <article>
              <div className="vap-icon"><CoinsIcon /></div>
              <div><h3>2. Earn Tier Points by journey type and cabin</h3><p>Receive Tier Points based on the distance, region and cabin class of your flight.</p></div>
            </article>
            <article>
              <div className="vap-icon"><BarsIcon /></div>
              <div><h3>3. Move up status levels and unlock recognition</h3><p>As you collect Tier Points, you&apos;ll progress through the status bands and unlock new benefits and opportunities.</p></div>
            </article>
          </div>
        </section>

        <section className="vap-earn-status" id="earn">
          <div className="vap-shell vap-two-col">
            <div>
              <span className="vap-kicker">Earning Tier Points</span>
              <h2>How Tier Points are earned</h2>
              <p className="vap-lead compact">Tier Points are awarded based on the type of flight, route and cabin class. Here are some example values:</p>
              <div className="vap-points-table">
                {earningRows.map(([label, value]) => (
                  <div key={label}><span>{label}</span><strong>{value}</strong></div>
                ))}
              </div>
            </div>

            <div id="bands">
              <span className="vap-kicker">Your progression</span>
              <h2>Status bands</h2>
              <p className="vap-lead compact">As you earn Tier Points, you&apos;ll progress through the status bands. Higher tiers recognise your commitment and open up new opportunities.</p>
              <div className="vap-status-card">
                {statusBands.map(([name, range, cls]) => (
                  <div className="vap-status-row" key={name}>
                    <span className={`vap-tier-dot ${cls}`} />
                    <strong>{name}</strong>
                    <span>{range}</span>
                  </div>
                ))}
                <div className="vap-current-box">
                  <div><span>Current tier points</span><strong>{currentPoints.toLocaleString()} Tier Points</strong></div>
                  <b>{nextThreshold ? `${pointsToNext.toLocaleString()} Tier Points to ${nextBand}` : `${currentBand} status reached`}</b>
                  <div className="vap-progress" aria-label={`${progress.toFixed(0)} percent progress toward ${nextBand}`}><span style={{ width: `${progress}%` }} /></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="tp-examples vap-shell" id="examples">
          <span className="vap-kicker">Example journeys</span>
          <h2>Example journeys</h2>
          <p className="vap-lead compact">Here are some examples of how Tier Points are awarded on different types of flights.</p>
          <div className="tp-example-grid">
            {examples.map((example) => (
              <article key={example.title}>
                <div className="vap-icon small">
                  {example.icon === "flight" ? <FlightIcon /> : example.icon === "route" ? <RouteIcon /> : <GlobeIcon />}
                </div>
                <div>
                  <h3>{example.title}</h3>
                  <strong>{example.points}</strong>
                  <p>{example.note}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="tp-used vap-shell">
          <span className="vap-kicker">What Tier Points are used for</span>
          <h2>What Tier Points are used for</h2>
          <p className="vap-lead compact">Tier Points do more than just track your flights. They play an important role in your journey across British Airways Virtual.</p>
          <div className="vap-reward-grid">
            <article><div className="vap-icon small"><TrophyIcon /></div><div><h3>Status recognition</h3><p>Tier Points determine your status level and recognise your flying commitment.</p></div></article>
            <article><div className="vap-icon small"><GiftIcon /></div><div><h3>Access to future perks</h3><p>Higher status levels unlock new features, events and exclusive opportunities within BAV.</p></div></article>
            <article><div className="vap-icon small"><BarsIcon /></div><div><h3>Career progression across the VA</h3><p>Your Tier Points reflect your long-term dedication and help open doors to new roles and experiences.</p></div></article>
          </div>
          <div className="vap-points-action">
            <Link className="vap-primary-button" href={isLoggedIn ? "/account#membership" : "/login"}>{isLoggedIn ? "View my tier points" : "Log in to view my tier points"} <span>→</span></Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
