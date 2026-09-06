import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "About your account",
  description: "Learn how your British Airways Virtual pilot account keeps flights, progress, points and settings together.",
};

type IconName = "person" | "plane" | "bars" | "gear" | "globe" | "community" | "document" | "star" | "info";

function AccountIcon({ name }: { name: IconName }) {
  const common = { viewBox: "0 0 48 48", "aria-hidden": true as const };

  if (name === "person") {
    return <svg {...common}><circle cx="24" cy="15" r="7" /><path d="M11 39c0-9 5-14 13-14s13 5 13 14H11Z" /></svg>;
  }
  if (name === "plane") {
    return <svg {...common}><path d="M6 26 42 11l-4 8-10 5-5 15-5 2-1-13-7 4-4 7-3 1 1-9-6-4 8-1Z" /></svg>;
  }
  if (name === "bars") {
    return <svg {...common}><path d="M8 40V27h8v13H8Zm12 0V18h8v22h-8Zm12 0V9h8v31h-8Z" /></svg>;
  }
  if (name === "gear") {
    return <svg {...common}><circle cx="24" cy="24" r="7" /><path d="m24 5 3 5 6-1 1 6 6 2-2 6 4 4-4 4 2 6-6 2-1 6-6-1-3 5-3-5-6 1-1-6-6-2 2-6-4-4 4-4-2-6 6-2 1-6 6 1 3-5Z" /></svg>;
  }
  if (name === "globe") {
    return <svg {...common}><circle cx="24" cy="24" r="17" /><path d="M7 24h34M24 7c6 6 9 11 9 17s-3 11-9 17M24 7c-6 6-9 11-9 17s3 11 9 17" /></svg>;
  }
  if (name === "community") {
    return <svg {...common}><circle cx="18" cy="17" r="6" /><circle cx="34" cy="18" r="5" /><path d="M6 39c0-9 5-14 12-14s12 5 12 14M28 29c8-2 13 2 14 10" /></svg>;
  }
  if (name === "document") {
    return <svg {...common}><path d="M13 7h22v34H13zM18 14h12M18 21h12M18 28h12M18 35h8" /></svg>;
  }
  if (name === "star") {
    return <svg {...common}><path d="m24 6 5.5 11.3 12.5 1.8-9 8.8 2.1 12.4L24 34.5l-11.1 5.8L15 27.9l-9-8.8 12.5-1.8L24 6Z" /></svg>;
  }
  return <svg {...common}><circle cx="24" cy="24" r="18" /><path d="M24 21v12M24 14v1" /></svg>;
}

const setupSteps = [
  { icon: "person" as const, title: "1. Create your account", text: "Sign up for free in just a few minutes." },
  { icon: "plane" as const, title: "2. Start flying", text: "Log your flights and enjoy the British Airways Virtual experience." },
  { icon: "bars" as const, title: "3. Track your progress", text: "See your flights, points and achievements as you go." },
];

const essentials = [
  { icon: "person" as const, title: "Pilot profile", text: "Create your pilot identity and customise your profile." },
  { icon: "plane" as const, title: "Flight history", text: "Keep a record of all your flights in one place." },
  { icon: "bars" as const, title: "VA Points & Tier Points", text: "Track your points and work towards new milestones." },
  { icon: "gear" as const, title: "Settings & preferences", text: "Personalise your experience to suit you." },
];

const reasons = [
  { icon: "bars" as const, title: "See your flying progress", text: "Watch your skills and achievements grow." },
  { icon: "community" as const, title: "Join events and community", text: "Take part in VA events and connect with fellow pilots." },
  { icon: "document" as const, title: "Keep your records in one place", text: "All your flights, points and activity, neatly organised." },
  { icon: "star" as const, title: "Unlock future rewards", text: "Work towards new ranks and special achievements." },
];

export default async function AboutYourAccountPage() {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.get("bav_demo_session")?.value === "1";

  return (
    <>
      <SiteHeader />
      <main className="aya-page">
        <div className="aya-breadcrumb-band">
          <div className="aya-shell aya-breadcrumbs">
            <Link href="/">Home</Link><span>›</span>
            <Link href="/about">British Airways Virtual</Link><span>›</span>
            <Link href="/destinations">Discover</Link><span>›</span>
            <strong>About your account</strong>
          </div>
        </div>

        <section className="aya-hero">
          <div className="aya-shell aya-hero-grid">
            <div className="aya-hero-copy">
              <span className="aya-kicker">Account</span>
              <h1>Your account, ready<br />for every flight.</h1>
              <p>A British Airways Virtual account lets you track your flights, progress, points and settings — all in one place. It&apos;s free to join and only takes a few minutes.</p>
              <div className="aya-actions">
                <Link className="aya-primary" href={isLoggedIn ? "/account" : "/login"}>{isLoggedIn ? "Open my account" : "Create account"}<span>→</span></Link>
                <Link className="aya-login" href={isLoggedIn ? "/account" : "/login"}>{isLoggedIn ? "Go to pilot dashboard" : "Pilot log in"}</Link>
              </div>
            </div>

            <div className="aya-hero-art" aria-hidden="true">
              <div className="aya-flight-icon aya-flight-icon-left"><AccountIcon name="plane" /></div>
              <div className="aya-route aya-route-left" />
              <div className="aya-profile-window">
                <div className="aya-window-dots"><i /><i /><i /></div>
                <div className="aya-profile-card">
                  <div className="aya-profile-row"><span><AccountIcon name="person" /></span><strong>Your profile</strong><i /></div>
                  <div className="aya-profile-row"><span><AccountIcon name="plane" /></span><strong>Your flights</strong><i /></div>
                  <div className="aya-profile-row"><span><AccountIcon name="bars" /></span><strong>Your points</strong><i /></div>
                  <div className="aya-profile-row"><span><AccountIcon name="gear" /></span><strong>Your settings</strong><i /></div>
                </div>
              </div>
              <div className="aya-route aya-route-right" />
              <div className="aya-flight-icon aya-globe"><AccountIcon name="globe" /></div>
              <div className="aya-hero-tag">One place for<br />your virtual<br />journey.<span /></div>
            </div>
          </div>
        </section>

        <section className="aya-section aya-how">
          <div className="aya-shell">
            <span className="aya-kicker">How it works</span>
            <h2>Get started in three simple steps.</h2>
            <div className="aya-step-grid">
              {setupSteps.map((step) => (
                <article className="aya-step" key={step.title}>
                  <span className="aya-circle-icon"><AccountIcon name={step.icon} /></span>
                  <div><h3>{step.title}</h3><p>{step.text}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="aya-section aya-essentials">
          <div className="aya-shell">
            <span className="aya-kicker">What your account includes</span>
            <h2>All the essentials for your virtual journey.</h2>
            <div className="aya-essential-grid">
              {essentials.map((item) => (
                <article className="aya-essential-card" key={item.title}>
                  <span className="aya-circle-icon"><AccountIcon name={item.icon} /></span>
                  <div><h3>{item.title}</h3><p>{item.text}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="aya-section aya-reasons">
          <div className="aya-shell">
            <span className="aya-kicker">Why you need an account</span>
            <h2>More than just flights.</h2>
            <div className="aya-reason-grid">
              {reasons.map((item) => (
                <article className="aya-reason" key={item.title}>
                  <span className="aya-circle-icon small"><AccountIcon name={item.icon} /></span>
                  <div><h3>{item.title}</h3><p>{item.text}</p></div>
                </article>
              ))}
            </div>

            <div className="aya-disclaimer">
              <span className="aya-info-icon"><AccountIcon name="info" /></span>
              <strong>Flight simulation only</strong>
              <p>British Airways Virtual is for an independent virtual airline experience. It is not linked to British Airways Plc and does not include real-world bookings, payments or customer accounts.</p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
