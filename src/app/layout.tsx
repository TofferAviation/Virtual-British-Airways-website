import type { Metadata } from "next";
import "./globals.css";
import "./portal.css";
import "./pages.css";

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
