import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { getPilotSession } from "@/lib/pilot-auth";
import { PilotRegisterForm } from "./PilotRegisterForm";

export const metadata = { title: "Create pilot account" };

export default async function RegisterPage() {
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
        <div className="login-header-actions"><Link href="/login" className="login-header-button">Log in</Link><span className="account-avatar" aria-hidden="true" /></div>
      </header>

      <section className="login-main pilot-auth-main">
        <div className="login-copy-block pilot-auth-copy">
          <div className="section-kicker">British Airways Virtual</div>
          <h1>Create your BAV pilot account</h1>
          <h2>Your account is now managed directly by British Airways Virtual.</h2>
          <p className="pilot-auth-intro">Create one account for flight bookings, PIREPs, progression, events, support and the future FreeFlight ACARS client.</p>
          <PilotRegisterForm />
          <p className="login-security-copy">This is an independent flight-simulation account. It is not a British Airways Plc customer account and does not connect to real-world Executive Club credentials.</p>
        </div>
        <div className="login-mosaic" aria-label="Virtual airline imagery"><div className="login-tile tile-crew" /><div className="login-tile tile-aircraft" /><div className="login-tile tile-cabin" /></div>
      </section>

      <footer className="login-page-footer"><div className="login-footer-logo"><BrandLogo variant="white" /></div><div><strong>Flight simulation only</strong><p>Independent virtual airline project · Not affiliated with British Airways Plc</p></div></footer>
    </main>
  );
}
