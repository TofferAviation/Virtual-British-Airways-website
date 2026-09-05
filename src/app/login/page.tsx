import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";

export const metadata = { title: "Pilot login" };

export default async function LoginPage() {
  const cookieStore = await cookies();
  if (cookieStore.get("bav_demo_session")?.value === "1") {
    redirect("/account");
  }

  return (
    <main className="login-page">
      <header className="login-header">
        <nav className="login-header-nav" aria-label="Account navigation">
          <Link href="/">Home</Link>
          <Link href="/destinations">Explore</Link>
          <Link href="/help">Help</Link>
        </nav>
        <Link className="login-brand" href="/">
          <BrandLogo variant="white" priority />
        </Link>
        <div className="login-header-actions">
          <Link href="/api/auth/mock-login" className="login-header-button">Log in</Link>
          <span className="account-avatar" aria-hidden="true" />
        </div>
      </header>

      <section className="login-main">
        <div className="login-copy-block">
          <div className="section-kicker">British Airways Virtual Club</div>
          <h1>Unlock an enhanced virtual flying experience</h1>
          <h2>Your pilot account brings your VA career together.</h2>
          <ul>
            <li>View Phoenix-compatible pilot statistics and recent flights</li>
            <li>Track VA Points, Tier Points and virtual membership progress</li>
            <li>Manage virtual flight assignments and briefings</li>
            <li>Keep your website and Phoenix identity aligned</li>
          </ul>
          <div className="login-cta-row">
            <Link className="button button-primary" href="/api/auth/mock-login">Preview signed-in account</Link>
            <a className="button button-outline" href="https://vamsys.io" rel="noreferrer">Open vAMSYS</a>
          </div>
          <p className="login-security-copy">
            This development login creates a temporary site-wide pilot session so every page reflects the same signed-in state. The production flow will hand authentication to vAMSYS or another approved identity provider and will not ask pilots to give us their vAMSYS password directly.
          </p>
        </div>

        <div className="login-mosaic" aria-label="Virtual airline imagery">
          <div className="login-tile tile-crew" />
          <div className="login-tile tile-aircraft" />
          <div className="login-tile tile-cabin" />
        </div>
      </section>

      <footer className="login-page-footer">
        <div className="login-footer-logo"><BrandLogo variant="white" /></div>
        <div>
          <strong>Flight simulation only</strong>
          <p>Independent virtual airline project · Not affiliated with British Airways Plc</p>
        </div>
      </footer>
    </main>
  );
}
