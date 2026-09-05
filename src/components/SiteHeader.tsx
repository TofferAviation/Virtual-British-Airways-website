import Link from "next/link";
import { cookies } from "next/headers";
import { BrandLogo } from "@/components/BrandLogo";

export async function SiteHeader() {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.get("bav_demo_session")?.value === "1";

  return (
    <>
      <div className="legal-strip">
        <strong>BRITISH AIRWAYS VIRTUAL</strong>
        <span>Independent virtual airline for flight simulation · Not affiliated with British Airways Plc</span>
      </div>
      <header className="site-header">
        <Link className="site-brand" href="/" aria-label="British Airways Virtual home">
          <BrandLogo priority />
        </Link>

        <nav className="site-nav" aria-label="Primary navigation">
          <div className="site-nav-item site-nav-discover">
            <Link className="site-nav-trigger" href="/destinations" aria-haspopup="true">
              Discover
            </Link>

            <div className="site-mega-menu" aria-label="Discover menu">
              <div className="site-mega-inner">
                <div className="site-mega-column">
                  <h3>British Airways Virtual</h3>
                  <Link href="/">About the VA</Link>
                  <Link href="/fleet">Our fleet</Link>
                  <Link href="/destinations">Our network</Link>
                  <Link href="/help">What&apos;s new</Link>
                  <Link href="/help">Operations information</Link>
                </div>

                <div className="site-mega-column">
                  <h3>Pilot Club</h3>
                  <Link href={isLoggedIn ? "/account" : "/login"}>About your account</Link>
                  <Link href={isLoggedIn ? "/account#membership" : "/login"}>About tier points</Link>
                  <Link href={isLoggedIn ? "/account#membership" : "/login"}>VA Points</Link>
                  <Link href={isLoggedIn ? "/account#trips" : "/login"}>Flight history</Link>
                  <Link href={isLoggedIn ? "/account" : "/login"}>Pilot progression</Link>
                </div>

                <div className="site-mega-column">
                  <h3>Flights and destinations</h3>
                  <Link href="/destinations">Explore our destinations</Link>
                  <Link href="/book?to=LHR">Flights to London</Link>
                  <Link href="/book?to=JFK">Flights to New York</Link>
                  <Link href="/book?to=LAX">Flights to Los Angeles</Link>
                  <Link href="/book?to=SFO">Flights to San Francisco</Link>
                  <Link href="/book">Routes and timetables</Link>
                  <Link href="/book">Before you fly</Link>
                </div>

                <div className="site-mega-column">
                  <h3>Operations</h3>
                  <Link href="/fleet">Short haul</Link>
                  <Link href="/fleet">Long haul</Link>
                  <Link href="/fleet">CityFlyer</Link>
                  <Link href={isLoggedIn ? "/account" : "/login"}>Assignments</Link>
                </div>

                <div className="site-mega-column">
                  <h3>Community</h3>
                  <Link href="/help">Events</Link>
                  <Link href="/help">Tours</Link>
                  <Link href="/help">Discord</Link>
                  <Link href="/help">News</Link>
                </div>

                <div className="site-mega-column">
                  <h3>Extras</h3>
                  <Link href="/help">Phoenix</Link>
                  <a href="https://vamsys.io" rel="noreferrer">vAMSYS</a>
                  <Link href="/help">Operations manual</Link>
                  <Link href="/help">Support</Link>
                </div>
              </div>
            </div>
          </div>

          <Link href="/book">Fly</Link>
          <Link href={isLoggedIn ? "/account" : "/login"}>Manage</Link>
          <Link href={isLoggedIn ? "/account" : "/login"}>Crew</Link>
          <Link href="/help">Help</Link>
        </nav>

        <div className="header-actions">
          {isLoggedIn ? (
            <>
              <Link className="button button-outline" href="/account">Pilot account</Link>
              <Link className="button button-outline" href="/api/auth/logout">Log out</Link>
            </>
          ) : (
            <Link className="button button-outline" href="/login">Pilot log in</Link>
          )}
        </div>
      </header>
    </>
  );
}
