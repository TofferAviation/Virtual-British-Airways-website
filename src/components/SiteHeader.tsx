import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

export function SiteHeader() {
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
          <Link href="/account">Manage</Link>
          <Link href="/account">Crew</Link>
          <Link href="/help">Help</Link>
        </nav>
        <div className="header-actions">
          <Link className="button button-outline" href="/login">
            Pilot log in
          </Link>
        </div>
      </header>
    </>
  );
}
