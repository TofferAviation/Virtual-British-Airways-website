import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getPilotSession } from "@/lib/pilot-auth";
import { getStaffSession } from "@/lib/staff-auth";

function SearchIcon() {
  return <span className="header-search-icon" aria-hidden="true" />;
}

function UserIcon() {
  return (
    <span className="header-user-icon" aria-hidden="true">
      <span className="header-user-head" />
      <span className="header-user-shoulders" />
    </span>
  );
}

function OneworldBadge() {
  return (
    <span aria-hidden="true">
      <span>one</span>
      <span>world</span>
    </span>
  );
}

function staffRoleLabel(roleId: string) {
  const labels: Record<string, string> = {
    admin: "Admin",
    operations: "Operations",
    events: "Events",
    support: "Support",
    "content-editor": "Content Editor",
    moderator: "Moderator",
  };
  return labels[roleId] ?? roleId.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function SiteHeader() {
  const [pilotSession, staffSession] = await Promise.all([getPilotSession(), getStaffSession()]);
  const isLoggedIn = Boolean(pilotSession);
  const manageHref = staffSession ? "/staff" : pilotSession ? "/account" : "/login";

  return (
    <header className="site-header ba-reference-header">
      <nav className="site-nav site-nav-left" aria-label="Primary navigation">
        <div className="site-nav-item site-nav-discover">
          <Link className="site-nav-trigger" href="/destinations" aria-haspopup="true">Discover</Link>
          <div className="site-mega-menu" aria-label="Discover menu">
            <div className="site-mega-inner">
              <div className="site-mega-column"><h3>British Airways Virtual</h3><Link href="/about">About the VA</Link><Link href="/fleet">Our fleet</Link><Link href="/destinations">Our network</Link><Link href="/oneworld">Partners and alliances</Link><Link href="/news">What&apos;s new</Link><Link href="/help">Operations information</Link></div>
              <div className="site-mega-column"><h3>Pilot Club</h3><Link href="/about-your-account">About your account</Link><Link href="/tier-points">About tier points</Link><Link href="/va-points">VA Points</Link><Link href={isLoggedIn ? "/account#trips" : "/login"}>Flight history</Link><Link href={isLoggedIn ? "/account" : "/login"}>Pilot progression</Link></div>
              <div className="site-mega-column"><h3>Flights and destinations</h3><Link href="/destinations">Explore our destinations</Link><Link href="/book?to=LHR">Flights to London</Link><Link href="/book?to=JFK">Flights to New York</Link><Link href="/book?to=LAX">Flights to Los Angeles</Link><Link href="/book?to=SFO">Flights to San Francisco</Link><Link href="/book">Routes and timetables</Link><Link href="/book">Before you fly</Link></div>
              <div className="site-mega-column"><h3>Operations</h3><Link href="/fleet">Short haul</Link><Link href="/fleet">Long haul</Link><Link href="/fleet">CityFlyer</Link><Link href={isLoggedIn ? "/account" : "/login"}>Assignments</Link></div>
              <div className="site-mega-column"><h3>Community</h3><Link href="/events">Events</Link><Link href="/help">Tours</Link><a href="https://discord.gg/HM76YewaWe" target="_blank" rel="noreferrer">Join our Discord ↗</a><Link href="/news">News</Link></div>
              <div className="site-mega-column"><h3>Extras</h3><Link href="/support/tickets">Support tickets</Link><Link href="/service-status">Service status</Link><Link href="/help">Operations manual</Link><Link href={staffSession ? "/staff" : "/staff-login"}>Staff Centre</Link>{staffSession ? <Link href="/staff/permissions">User permissions</Link> : null}</div>
            </div>
          </div>
        </div>

        <Link href="/book">Book</Link>
        <Link href={manageHref}>Manage</Link>
        <Link href="/help">Help</Link>
        <Link className="header-search-link" href="/book"><SearchIcon /><span>Search</span></Link>
      </nav>

      <Link className="site-brand site-brand-centered" href="/" aria-label="British Airways Virtual home"><BrandLogo variant="white" priority /></Link>

      <div className="header-actions header-actions-right">
        <ThemeToggle />
        {staffSession ? (
          <>
            <Link className="header-user-link" href="/staff"><UserIcon /><span>{staffSession.name}</span></Link>
            <Link className="header-admin-badge" href="/staff/permissions">{staffSession.isMasterAdmin ? "Master Admin" : staffRoleLabel(staffSession.roleId)}</Link>
            <Link className="header-logout-button" href="/api/staff/logout">Log out</Link>
            <Link className="header-oneworld" href="/oneworld" aria-label="oneworld virtual alliance information"><OneworldBadge /></Link>
          </>
        ) : pilotSession ? (
          <>
            <Link className="header-user-link" href="/account"><UserIcon /><span>{pilotSession.name}</span></Link>
            <Link className="header-logout-button" href="/api/auth/logout">Log out</Link>
            <Link className="header-oneworld" href="/oneworld" aria-label="oneworld virtual alliance information"><OneworldBadge /></Link>
          </>
        ) : (
          <>
            <Link className="header-user-link" href="/login"><UserIcon /><span>Pilot log in</span></Link>
            <Link className="header-oneworld" href="/oneworld" aria-label="oneworld virtual alliance information"><OneworldBadge /></Link>
          </>
        )}
      </div>
    </header>
  );
}
