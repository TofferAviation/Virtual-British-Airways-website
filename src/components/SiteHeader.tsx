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
          <Link href="/destinations">Discover</Link>
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
