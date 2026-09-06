import type { Metadata } from "next";
import "./globals.css";
import "./portal.css";
import "./pages.css";
import "./branding.css";
import "./account-v2.css";
import "./discover.css";
import "./mega-menu.css";
import "./home-center.css";
import "./dark-shell.css";
import "./ba-reference-header.css";
import "./oneworld.css";
import "./fleet-v2.css";
import "./fleet-banner-fix.css";
import "./about-va.css";
import "./va-points.css";
import "./tier-points.css";
import "./events.css";
import "./about-your-account.css";
import "./help.css";
import "./help-hero.css";

export const metadata: Metadata = {
  title: {
    default: "British Airways Virtual",
    template: "%s | British Airways Virtual",
  },
  description:
    "British Airways Virtual — immersive flight-simulation operations, schedules, pilot statistics and community tools.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
