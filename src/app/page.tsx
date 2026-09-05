import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { FlightSearch } from "@/components/FlightSearch";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { featuredDestinations, fleet } from "@/lib/mockData";

export default async function HomePage() {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.get("bav_demo_session")?.value === "1";

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
              Fly a structured British Airways-inspired network in your simulator, build your pilot career and carry your progress between the website and Phoenix.
            </p>
            <Link className="button button-light" href="/book">Browse virtual flights</Link>
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
            <div className="site-stat"><strong>1</strong><span>Shared Phoenix identity</span></div>
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

        <section className="content-section split-cta">
          <div>
            <div className="section-kicker">Pilot career</div>
            <h2 className="section-title">Your website account and Phoenix will share the same career</h2>
            <p className="lead-copy">
              The production plan is for one authoritative pilot record. Complete a flight in Phoenix and the website will be able to reflect the same hours, landing rate, points and tier progress.
            </p>
          </div>
          <div className="cta-panel">
            <h3>{isLoggedIn ? "Welcome back, Pilot" : "Already flying with us?"}</h3>
            <p>{isLoggedIn ? "Your pilot session is active across the website." : "Open the pilot portal foundation and preview the account experience."}</p>
            <Link className="button button-primary" href={isLoggedIn ? "/account" : "/login"}>{isLoggedIn ? "Open pilot account" : "Pilot log in"}</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
