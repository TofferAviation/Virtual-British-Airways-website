import type { Metadata } from "next";
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
      <SiteFooter />
    </>
  );
}
