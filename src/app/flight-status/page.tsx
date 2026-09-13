import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { CurrentFlightStatus } from "@/components/CurrentFlightStatus";
import { listCurrentFlightStatuses } from "@/lib/flight-status";
import "./flight-status.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Flight status", description: "Live British Airways Virtual operations status." };

export default async function FlightStatusPage() {
  const flights = await listCurrentFlightStatuses();
  return <><SiteHeader /><main className="page-shell flight-status-page"><div className="page-container flight-status-container"><section className="flight-status-hero"><span className="section-kicker">LIVE OPERATIONS</span><h1>Flight status</h1><p>Follow active British Airways Virtual services from the moment their Cabin Control ACARS session begins.</p></section><CurrentFlightStatus initialFlights={flights} /></div></main><SiteFooter /></>;
}
