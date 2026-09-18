import type { Metadata } from "next";
import { FirstVisitWelcome } from "@/components/FirstVisitWelcome";
import "./globals.css";
import "./portal.css";
import "./pages.css";
import "./branding.css";
import "./account-v2.css";
import "./discover.css";
import "./mega-menu.css";
import "./home-center.css";
import "./home-ember.css";
import "./hub-traffic.css";
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
import "./handbook.css";
import "./handbook-ember-logo.css";
import "./handbook-fleet-lifecycle.css";
import "./handbook-self-service.css";
import "./staff.css";
import "./staff-header.css";
import "./staff-zoom.css";
import "./staff-permissions.css";
import "./staff-access.css";
import "./service-settings.css";
import "./service-status.css";
import "./news.css";
import "./news-admin.css";
import "./news-builder.css";
import "./theme.css";
import "./theme-pages.css";
import "./tickets.css";
import "./operations.css";
import "./live-operations-map.css";
import "./live-operations-tracker.css";
import "./pilot-auth.css";
import "./pilot-rules.css";
import "./pilot-progression.css";
import "./rank-insignia.css";
import "./ba-radar.css";
import "./ba-radar-home-cta.css";
import "./ba-radar-osm.css";
import "./ba-radar-tracker-layout.css";
import "./first-visit-welcome.css";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: {
    default: "British Airways Virtual",
    template: "%s | British Airways Virtual",
  },
  description:
    "British Airways Virtual — immersive flight-simulation operations, schedules, pilot statistics and community tools.",
};

const themeBootScript = `
(function () {
  try {
    var savedTheme = window.localStorage.getItem("bav-theme");
    document.documentElement.dataset.theme = savedTheme === "dark" ? "dark" : "light";
  } catch (error) {
    document.documentElement.dataset.theme = "light";
  }
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        {children}
        <FirstVisitWelcome />
      </body>
    </html>
  );
}
