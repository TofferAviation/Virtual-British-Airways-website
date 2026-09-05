import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { pilot } from "@/lib/mockData";

export const metadata: Metadata = {
  title: "VA Points",
  description: "How VA Points work, how to earn them and status progression in British Airways Virtual.",
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

function HeroGraphic() {
  return (
    <svg className="vap-hero-art" viewBox="0 0 760 300" role="img" aria-label="VA Points global route illustration">
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
      <text className="vap-badge-text" x="378" y="137" textAnchor="middle">VA</text>
      <text className="vap-badge-text" x="378" y="166" textAnchor="middle">POINTS</text>
      <path className="vap-speedmarque-red" d="M349 188h58l-24 7Z" />
      <path className="vap-speedmarque-blue" d="M383 195h23l-15 6Z" />
      <text className="vap-hero-tag" x="614" y="164">Rewarding</text>
      <text className="vap-hero-tag" x="614" y="187">every journey</text>
      <path className="vap-tag-line" d="M614 207h50" />
    </svg>
  );
}

const earningRows = [
  ["Completed flight", "100 pts"],
  ["Per flight hour", "+20 pts"],
  ["On-time arrival", "+25 pts"],
  ["Long-haul bonus", "+50 pts"],
  ["Weekly streak", "+75 pts"],
  ["Event flight bonus", "+100 pts"],
];

const statusLevels = [
  ["Blue", "0 to 999", "blue"],
  ["Bronze", "1,000 to 2,499", "bronze"],
  ["Silver", "2,500 to 4,999", "silver"],
  ["Gold", "5,000+", "gold"],
];

export default async function VaPointsPage() {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.get("bav_demo_session")?.value === "1";
  const currentPoints = isLoggedIn ? pilot.points : 2450;
  const nextThreshold = currentPoints < 1000 ? 1000 : currentPoints < 2500 ? 2500 : currentPoints < 5000 ? 5000 : null;
  const lowerThreshold = currentPoints < 1000 ? 0 : currentPoints < 2500 ? 1000 : currentPoints < 5000 ? 2500 : 5000;
  const progress = nextThreshold ? Math.max(0, Math.min(100, ((currentPoints - lowerThreshold) / (nextThreshold - lowerThreshold)) * 100)) : 100;
  const pointsToNext = nextThreshold ? Math.max(0, nextThreshold - currentPoints) : 0;
  const nextName = currentPoints < 1000 ? "Bronze" : currentPoints < 2500 ? "Silver" : currentPoints < 5000 ? "Gold" : "Gold";

  return (
    <>
      <SiteHeader />
      <main className="vap-page">
        <div className="vap-breadcrumbs">
          <Link href="/">Home</Link><span>›</span>
          <Link href="/about">British Airways Virtual</Link><span>›</span>
          <Link href="/destinations">Discover</Link><span>›</span>
          <strong>VA Points</strong>
        </div>

        <section className="vap-hero">
          <div className="vap-shell vap-hero-grid">
            <div className="vap-hero-copy">
              <span className="vap-kicker">VA Points</span>
              <h1>Earn points every<br />time you fly.</h1>
              <p>
                VA Points reward activity across British Airways Virtual. Pilots earn points for completed flights,
                consistency, long-haul operations, event flying and on-time performance. Points help track progression,
                unlock status tiers and support future rewards.
              </p>
            </div>
            <HeroGraphic />
          </div>
        </section>

        <nav className="vap-section-nav" aria-label="VA Points sections">
          <a className="active" href="#overview">Overview</a>
          <a href="#earn">How to earn</a>
          <a href="#status">Status levels</a>
          <a href="#rewards">Rewards</a>
        </nav>

        <section className="vap-how vap-shell" id="overview">
          <span className="vap-kicker">How it works</span>
          <h2>How the system works</h2>
          <p className="vap-lead">
            Earning VA Points is simple. Fly, earn, and progress. Your activity across British Airways Virtual is tracked
            automatically, with points awarded for a range of flying activities and achievements.
          </p>
          <div className="vap-steps">
            <article>
              <div className="vap-icon"><FlightIcon /></div>
              <div><h3>1. Complete eligible flights</h3><p>Fly any eligible route on the network and have it recorded in your pilot account.</p></div>
            </article>
            <article>
              <div className="vap-icon"><CoinsIcon /></div>
              <div><h3>2. Earn base and bonus points</h3><p>Receive base points for every flight, with additional bonus points for certain achievements.</p></div>
            </article>
            <article>
              <div className="vap-icon"><BarsIcon /></div>
              <div><h3>3. Climb tiers and unlock rewards</h3><p>Your points contribute to your status level and unlock future rewards and opportunities within British Airways Virtual.</p></div>
            </article>
          </div>
        </section>

        <section className="vap-earn-status" id="earn">
          <div className="vap-shell vap-two-col">
            <div>
              <span className="vap-kicker">Earning points</span>
              <h2>Ways to earn VA Points</h2>
              <p className="vap-lead compact">Points are awarded for a range of activities across British Airways Virtual. Here are some of the main ways to earn points:</p>
              <div className="vap-points-table">
                {earningRows.map(([label, value]) => (
                  <div key={label}><span>{label}</span><strong>{value}</strong></div>
                ))}
              </div>
            </div>

            <div id="status">
              <span className="vap-kicker">Your progression</span>
              <h2>Status levels</h2>
              <p className="vap-lead compact">As you earn points, you&apos;ll progress through our status levels. Higher tiers recognise your commitment and open up new opportunities.</p>
              <div className="vap-status-card">
                {statusLevels.map(([name, range, cls]) => (
                  <div className="vap-status-row" key={name}>
                    <span className={`vap-tier-dot ${cls}`} />
                    <strong>{name}</strong>
                    <span>{range}</span>
                  </div>
                ))}
                <div className="vap-current-box">
                  <div><span>Your current points</span><strong>{currentPoints.toLocaleString()} points</strong></div>
                  <b>{nextThreshold ? `${pointsToNext.toLocaleString()} points to ${nextName}` : "Top tier reached"}</b>
                  <div className="vap-progress" aria-label={`${progress.toFixed(0)} percent progress toward ${nextName}`}><span style={{ width: `${progress}%` }} /></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="vap-rewards vap-shell" id="rewards">
          <span className="vap-kicker">Beyond flying</span>
          <h2>What points are used for</h2>
          <p className="vap-lead compact">VA Points do more than track your flights. They help enhance your experience across British Airways Virtual.</p>
          <div className="vap-reward-grid">
            <article><div className="vap-icon small"><TrophyIcon /></div><div><h3>Career progression</h3><p>Points contribute to your status level and showcase your commitment as a virtual pilot.</p></div></article>
            <article><div className="vap-icon small"><BarsIcon /></div><div><h3>Leaderboards</h3><p>Compete with fellow pilots and see how you rank on our global leaderboards.</p></div></article>
            <article><div className="vap-icon small"><GiftIcon /></div><div><h3>Future rewards</h3><p>Points will support future rewards, events and exclusive opportunities within BAV.</p></div></article>
          </div>
          <div className="vap-points-action">
            <Link className="vap-primary-button" href={isLoggedIn ? "/account#membership" : "/login"}>{isLoggedIn ? "View my points" : "Log in to view my points"} <span>→</span></Link>
          </div>
          <p className="vap-framework-note">VA Points values shown are the current development framework and can be rebalanced before live vAMSYS integration.</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
