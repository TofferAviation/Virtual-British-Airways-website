import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "Pilot login" };

export default function LoginPage() {
  return (
    <main className="login-page">
      <header className="login-header">
        <nav className="login-header-nav" aria-label="Account navigation">
          <Link href="/">Home</Link>
          <Link href="/destinations">Explore</Link>
          <Link href="/help">Help</Link>
        </nav>
        <Link className="login-brand" href="/">
          <Image src="/branding/ba-virtual-logo-white.svg" alt="British Airways Virtual" width={360} height={176} priority />
        </Link>
        <div className="login-header-actions">
          <Link href="/account" className="login-header-button">Log in</Link>
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
            <Link className="button button-primary" href="/account">Preview signed-in account</Link>
            <a className="button button-outline" href="https://vamsys.io" rel="noreferrer">Open vAMSYS</a>
          </div>
          <p className="login-security-copy">
            The production login will hand authentication to vAMSYS or another approved identity flow. This website will not ask pilots to give us their vAMSYS password directly.
          </p>
        </div>

        <div className="login-mosaic" aria-label="Virtual airline imagery">
          <div className="login-tile tile-crew" />
          <div className="login-tile tile-aircraft" />
          <div className="login-tile tile-cabin" />
        </div>
      </section>

      <footer className="login-page-footer">
        <Image src="/branding/ba-virtual-logo-white.svg" alt="British Airways Virtual" width={360} height={176} />
        <div>
          <strong>Flight simulation only</strong>
          <p>Independent virtual airline project · Not affiliated with British Airways Plc</p>
        </div>
      </footer>
    </main>
  );
}
