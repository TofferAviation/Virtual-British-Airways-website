import Link from "next/link";
import { cookies } from "next/headers";
import { BrandLogo } from "@/components/BrandLogo";

export async function SiteFooter() {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.get("bav_demo_session")?.value === "1";

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
          <Link href="/help">Help centre</Link>
          <a href="#">Operations manual</a>
          <a href="#">System status</a>
        </div>
      </div>
      <div className="footer-disclaimer">
        <strong>Important:</strong> British Airways Virtual is a flight-simulation virtual airline project. It is not British Airways Plc and does not sell, manage or modify real-world airline tickets or customer accounts.
      </div>
    </footer>
  );
}
