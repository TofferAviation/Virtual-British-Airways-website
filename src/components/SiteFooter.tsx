import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { getPilotSession } from "@/lib/pilot-auth";

export async function SiteFooter() {
  const isLoggedIn = Boolean(await getPilotSession());

  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <div className="footer-logo">
            <BrandLogo variant="white" />
          </div>
          <p className="footer-copy">
            Structured virtual-airline operations, pilot careers and community flying inspired by the British Airways network.
          </p>
        </div>
        <div>
          <h3>Virtual airline</h3>
          <Link href="/about">About the VA</Link>
          <Link href="/fleet">Fleet</Link>
          <Link href="/destinations">Destinations</Link>
          <Link href="/book">Schedules</Link>
        </div>
        <div>
          <h3>Pilots</h3>
          <Link href={isLoggedIn ? "/account" : "/login"}>{isLoggedIn ? "Pilot account" : "Pilot login"}</Link>
          <Link href="/account">Account</Link>
          <Link href="/account">Membership</Link>
        </div>
        <div>
          <h3>Support</h3>
          <Link href="/handbook">BAV Handbook</Link>
          <a href="https://discord.gg/HM76YewaWe" target="_blank" rel="noreferrer">Join our Discord ↗</a>
          <Link href="/handbook">Operations handbook</Link>
          <a href="#">System status</a>
        </div>
      </div>
      <div className="footer-disclaimer">
        <strong>Important:</strong> British Airways Virtual is a flight-simulation virtual airline project. It is not British Airways Plc and does not sell, manage or modify real-world airline tickets or customer accounts.
      </div>
    </footer>
  );
}
