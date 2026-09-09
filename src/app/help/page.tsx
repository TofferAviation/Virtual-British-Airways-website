import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { HelpClient } from "./HelpClient";

export const metadata: Metadata = {
  title: "Help centre",
  description: "Support, FAQs and pilot guidance for British Airways Virtual.",
};

export default function HelpPage() {
  return (
    <>
      <SiteHeader />
      <HelpClient />
      <section className="hc-shell hc-return" style={{ marginBottom: 18 }}>
        <div>
          <span className="hc-kicker">Support tickets</span>
          <h2>Need help from the team?</h2>
          <p>Open a private ticket, attach screenshots and follow staff replies from your pilot account.</p>
        </div>
        <div>
          <Link className="button button-primary" href="/support/tickets/new">Open a ticket</Link>
          <Link className="button button-outline" href="/support/tickets">Your tickets</Link>
        </div>
      </section>
      <SiteFooter />
    </>
  );
}
