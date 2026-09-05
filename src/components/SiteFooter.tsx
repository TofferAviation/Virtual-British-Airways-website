import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <Image
            className="footer-logo"
            src="/branding/ba-virtual-logo.svg"
            alt="British Airways Virtual"
            width={760}
            height={190}
          />
          <p className="footer-copy">
            Structured virtual-airline operations, pilot careers and community flying inspired by the British Airways network.
          </p>
        </div>
        <div>
          <h3>Virtual airline</h3>
          <Link href="/fleet">Fleet</Link>
          <Link href="/destinations">Destinations</Link>
          <Link href="/book">Schedules</Link>
        </div>
        <div>
          <h3>Pilots</h3>
          <Link href="/login">Pilot login</Link>
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
