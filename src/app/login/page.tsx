import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { getPilotSession } from "@/lib/pilot-auth";
import { PilotLoginForm } from "./PilotLoginForm";

export const metadata = { title: "Pilot login" };

export default async function LoginPage() {
  if (await getPilotSession()) redirect("/account");

  return (
    <main className="login-page">
      <header className="login-header">
        <nav className="login-header-nav" aria-label="Account navigation">
          <Link href="/">Home</Link>
          <Link href="/destinations">Explore</Link>
          <Link href="/help">Help</Link>
        </nav>
        <Link className="login-brand" href="/"><BrandLogo variant="white" priority /></Link>
        <div className="login-header-actions"><Link href="/register" className="login-header-button">Join BAV</Link><span className="account-avatar" aria-hidden="true" /></div>
      </header>

      <section className="login-main pilot-auth-main">
        <div className="login-copy-block pilot-auth-copy">
          <div className="section-kicker">British Airways Virtual Club</div>
          <h1>Your flying, directly with British Airways Virtual</h1>
          <h2>One in-house account for your complete virtual airline career.</h2>
          <ul>
            <li>Book flights from the BAV schedule</li>
            <li>Track VA Points, Tier Points and career progression</li>
            <li>Manage PIREPs, assignments and support tickets</li>
            <li>Use the same identity with the future FreeFlight ACARS client</li>
          </ul>
          <PilotLoginForm />
          <p className="login-security-copy">Pilot authentication is now handled by British Airways Virtual. Your BAV password is stored as a salted one-way hash and is separate from any third-party virtual-airline account.</p>
          <div className="pilot-staff-login">
            <span>British Airways Virtual staff?</span>
            <Link href="/staff-login">Staff login <span aria-hidden="true">→</span></Link>
          </div>
        </div>

        <div className="login-mosaic" aria-label="Virtual airline imagery"><div className="login-tile tile-crew" /><div className="login-tile tile-aircraft" /><div className="login-tile tile-cabin" /></div>
      </section>

      <footer className="login-page-footer"><div className="login-footer-logo"><BrandLogo variant="white" /></div><div><strong>Flight simulation only</strong><p>Independent virtual airline project · Not affiliated with British Airways Plc</p></div></footer>
    </main>
  );
}
