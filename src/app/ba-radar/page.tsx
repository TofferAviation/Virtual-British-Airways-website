import type { Metadata } from "next";
import { PublicBaRadar, type PublicRadarFlight } from "@/components/PublicBaRadar";
import { SiteHeader } from "@/components/SiteHeader";
import { listLiveAcarsSessions } from "@/lib/acars-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "BA-Radar",
  description: "Live British Airways Virtual simulator flight tracking.",
};

export default async function BaRadarPage() {
  const sessions = await listLiveAcarsSessions();
  const flights: PublicRadarFlight[] = sessions.map((session) => ({
    id: session.id,
    flightNumber: session.flightNumber,
    from: session.from,
    to: session.to,
    aircraft: session.aircraft,
    simulator: session.simulator,
    updatedAt: session.updatedAt,
    distanceNm: session.distanceNm,
    connectionHealthy: session.connectionHealthy,
    lastSnapshot: session.lastSnapshot,
    recentSnapshots: session.recentSnapshots ?? [],
  }));

  return <><SiteHeader /><main className="ba-radar-page"><PublicBaRadar initialFlights={flights} /></main></>;
}
