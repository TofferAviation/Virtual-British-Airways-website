import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getPilotSession } from "@/lib/pilot-auth";
import { getTomorrowIsoDate } from "@/lib/serverDate";
import { getFlightsForRoute } from "@/lib/route-store";
import { bookFlight } from "./actions";

export const dynamic = "force-dynamic";

const airportNames: Record<string, string> = {
  LHR: "London Heathrow", LGW: "London Gatwick", LCY: "London City", OSL: "Oslo Gardermoen", JFK: "New York JFK", LAX: "Los Angeles", PDX: "Portland, Oregon", DXB: "Dubai", SIN: "Singapore", HND: "Tokyo Haneda", CPT: "Cape Town", SYD: "Sydney",
};

export default async function BookPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const from = typeof params.from === "string" ? params.from.toUpperCase() : "LHR";
  const to = typeof params.to === "string" ? params.to.toUpperCase() : "OSL";
  const date = typeof params.date === "string" ? params.date : getTomorrowIsoDate();
  const flights = from === to ? [] : await getFlightsForRoute(from, to, date);
  const pilotSession = await getPilotSession();
  const unavailable = params.error === "unavailable";

  return (
    <>
      <SiteHeader />
      <main className="page-shell">
        <div className="page-container">
          <div className="booking-steps"><div className="booking-step active"><span>1</span>Choose virtual flight</div><div className="booking-step"><span>2</span>Flight briefing</div><div className="booking-step"><span>3</span>Confirm assignment</div></div>
          <section className="page-heading booking-heading"><div><div className="section-kicker">BAV scheduled flights</div><h1>{airportNames[from] ?? from} ({from}) → {airportNames[to] ?? to} ({to})</h1><p>{date} · British Airways Virtual operational schedule · In-house system</p></div><Link className="button button-outline" href="/#flight-search">Edit search</Link></section>
          {unavailable ? <div className="integration-note"><strong>Flight no longer available:</strong> the selected BAV assignment may have filled or been disabled by Operations. Choose another available service.</div> : null}
          <div className="booking-results-heading"><h2>Available virtual flights</h2><p>{flights.length} BAV scheduled service{flights.length === 1 ? "" : "s"} found for this route.</p></div>
          <div className="flight-results">
            {flights.length ? flights.map((flight) => (
              <article className="result-flight card" key={flight.routeId}>
                <div className="result-times"><div><strong>{flight.departure}</strong><span>{from}</span></div><div className="result-line"><span>{flight.duration}</span><i /></div><div><strong>{flight.arrival}</strong><span>{to}</span></div></div>
                <div className="result-meta"><strong>{flight.number} · British Airways Virtual</strong><span>{flight.aircraft}</span><span>Non-stop virtual service</span></div>
                <div className="result-availability"><strong>{flight.slots > 0 ? "● Available" : "● Full"}</strong><span>{flight.slots} of {flight.capacity} pilot slots open</span></div>
                {pilotSession ? (
                  flight.slots > 0 ? <form action={bookFlight}>
                    <input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} /><input type="hidden" name="date" value={date} /><input type="hidden" name="flightNumber" value={flight.number} /><input type="hidden" name="routeId" value={flight.routeId} />
                    <button className="button button-primary" type="submit">Select flight</button>
                  </form> : <button className="button button-primary" type="button" disabled>Flight full</button>
                ) : <Link className="button button-primary" href="/login">Log in to book</Link>}
              </article>
            )) : <div className="empty-state card"><h2>No BAV schedule published</h2><p>There is currently no active British Airways Virtual service for this city pair. Staff can add or enable services in the Staff Centre.</p><Link className="button button-primary" href="/">Return to flight search</Link></div>}
          </div>
          <div className="integration-note"><strong>In-house BAV schedule:</strong> availability now comes from the staff-managed BAV route store and live assignment capacity. Development fallback flights are no longer created for unpublished routes.</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
