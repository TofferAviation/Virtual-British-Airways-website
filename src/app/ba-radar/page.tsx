import type { Metadata } from "next";
import { PublicBaRadar } from "@/components/PublicBaRadar";
import { SiteHeader } from "@/components/SiteHeader";
import { listPublicRadarFlights } from "@/lib/radar-live";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BA-Radar",
  description: "Live British Airways Virtual simulator flight tracking.",
};

export default async function BaRadarPage() {
  const flights = await listPublicRadarFlights();

  return <><SiteHeader /><main className="ba-radar-page"><PublicBaRadar initialFlights={flights} /></main></>;
}
