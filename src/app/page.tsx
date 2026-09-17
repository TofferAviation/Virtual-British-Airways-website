import Image from "next/image";
import Link from "next/link";
import { FlightSearch } from "@/components/FlightSearch";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { featuredDestinations, fleet } from "@/lib/mockData";
import { getPilotSession } from "@/lib/pilot-auth";

export default async function HomePage() {
  const isLoggedIn = Boolean(await getPilotSession());

  return (
    <>
      <SiteHeader />
      <main>
        <section className="home-hero">
          <div className="home-hero-overlay" />
          <div className="home-hero-content">
            <div className="eyebrow">British Airways Virtual · London</div>
            <h1>Where your next virtual journey begins</h1>
            <p>
              Fly a structured British Airways-inspired network in your simulator, build your pilot career and carry your progress between the website and Ember.
            </p>
            <div className="home-hero-actions">
              <Link className="button button-light" href="/book">Browse virtual flights</Link>
              <Link className="button button-radar" href="/ba-radar">Open Live Map · BA-Radar</Link>
            </div>
            <div className="status-pill"><span /> Virtual operations online · Flight simulation only</div>
          </div>
        </section>

        <section className="search-shell" aria-label="Flight search">
          <FlightSearch />
        </section>

        <section className="content-section">
          <div className="section-kicker">Your journey</div>
          <h2 className="section-title">Everything a virtual BA pilot needs</h2>
          <div className="feature-grid">
            <Link className="feature-card" href="/book">
              <div className="feature-icon">✈</div>
              <div><h3>Scheduled flights</h3><p>Find an available service, choose your aircraft and reserve your next assignment.</p></div>
            </Link>
            <Link className="feature-card" href={isLoggedIn ? "/account" : "/login"}>
              <div className="feature-icon">◉</div>
              <div><h3>Pilot account</h3><p>See flight hours, landing statistics, VA points, tier progression and recent flights.</p></div>
            </Link>
            <Link className="feature-card" href="/fleet">
              <div className="feature-icon">▱</div>
              <div><h3>Fleet & operations</h3><p>Explore the aircraft available across short-haul, long-haul and CityFlyer operations.</p></div>
            </Link>
          </div>
        </section>

        <section className="stats-band">
          <div className="stats-inner">
            <div>
              <div className="section-kicker inverse">Virtual airline network</div>
              <h2>Designed around real airline-style operations</h2>
            </div>
            <div className="site-stat"><strong>214</strong><span>BA destinations target</span></div>
            <div className="site-stat"><strong>{fleet.length}</strong><span>Aircraft types</span></div>
            <div className="site-stat"><strong>24/7</strong><span>Pilot access</span></div>
            <div className="site-stat"><strong>1</strong><span>Shared Ember identity</span></div>
          </div>
        </section>

        <section className="content-section">
          <div className="section-kicker">Explore</div>
          <h2 className="section-title">Featured destinations</h2>
          <div className="destination-grid">
            {featuredDestinations.map((destination) => (
              <article className="destination-card" key={destination.code}>
                <Image src={destination.image} alt={destination.city} fill sizes="(max-width: 800px) 100vw, 25vw" />
                <div className="destination-shade" />
                <div className="destination-copy">
                  <span>{destination.code}</span>
                  <h3>{destination.city}</h3>
                  <Link href={`/book?to=${destination.code}`}>Find virtual flights</Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="content-section split-cta ember-home-journey">
          <div className="ember-home-copy">
            <div className="section-kicker">Ember ACARS Systems</div>
            <h2 className="section-title">Your BAV flight, connected from dispatch to PIREP.</h2>
            <p className="lead-copy">
              Ember brings your BAV assignment, SimBrief briefing, chosen aircraft registration and simulator telemetry into one connected flight desk.
            </p>
            <div className="ember-home-features" aria-label="Ember features">
              <article><strong>Assigned flight</strong><span>Refresh the selected BAV service and SimBrief briefing in Ember.</span></article>
              <article><strong>Registration-aware flying</strong><span>Reserve a dispatchable airframe and retain its hours, cycles and logbook history.</span></article>
              <article><strong>Live BA-Radar telemetry</strong><span>Send live aircraft position updates after engine start or pushback.</span></article>
              <article><strong>Automatic PIREPs</strong><span>A completed ACARS flight creates a linked PIREP for staff review.</span></article>
            </div>
            <div className="ember-home-roadmap">
              <strong>Looking ahead</strong>
              <p>Future Ember releases will add richer post-flight summaries, deeper operational views and more connected cabin workflows as BAV grows.</p>
            </div>
          </div>
          <aside className="cta-panel ember-home-panel">
            <span>British Airways Virtual × Ember</span>
            <h3>{isLoggedIn ? "Your BAV account is ready" : "Ready when you are"}</h3>
            <p>{isLoggedIn ? "Open your account settings to view Ember access and prepare for your next connected flight." : "Sign in with your BAV pilot account to connect Ember to your assignments and career."}</p>
            <Link className="button button-primary" href={isLoggedIn ? "/account/profile" : "/login"}>{isLoggedIn ? "View Ember access" : "Pilot log in"}</Link>
            <Link className="ember-home-radar-link" href="/ba-radar">Explore BA-Radar →</Link>
          </aside>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
