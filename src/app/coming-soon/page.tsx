import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

export const metadata = {
  title: "Coming soon",
  description: "British Airways Virtual is preparing for launch.",
  robots: { index: false, follow: false },
};

export default function ComingSoonPage() {
  return (
    <main className="coming-soon-page">
      <div className="coming-soon-glow coming-soon-glow-left" aria-hidden="true" />
      <div className="coming-soon-glow coming-soon-glow-right" aria-hidden="true" />
      <section className="coming-soon-card" aria-labelledby="coming-soon-title">
        <div className="coming-soon-brand"><BrandLogo variant="white" priority /></div>
        <span className="coming-soon-kicker">Coming soon</span>
        <h1 id="coming-soon-title">Your approach is just the beginning.</h1>
        <p>British Airways Virtual is preparing a connected virtual-airline experience for pilots flying X-Plane and Microsoft Flight Simulator.</p>
        <div className="coming-soon-features" aria-label="Launch experience"><span>Fly</span><i aria-hidden="true" /><span>Track</span><i aria-hidden="true" /><span>Connect</span></div>
        <div className="coming-soon-existing"><strong>Already a BAV pilot?</strong><span>Sign in to access your account, flights and Ember services.</span><Link href="/login?returnTo=%2Faccount">Pilot sign in <b aria-hidden="true">→</b></Link></div>
        <p className="coming-soon-legal">British Airways Virtual is an independent flight-simulation project and is not affiliated with or endorsed by British Airways Plc.</p>
      </section>
    </main>
  );
}
