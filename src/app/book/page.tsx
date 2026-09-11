import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getPilotSession } from "@/lib/pilot-auth";
import { getTomorrowIsoDate } from "@/lib/serverDate";
import { getFlightsForAircraft, getFlightsForRoute } from "@/lib/route-store";
import { bookFlight } from "./actions";

export const dynamic = "force-dynamic";

const airportNames: Record<string, string> = {
  LHR: "London Heathrow", LGW: "London Gatwick", LCY: "London City", OSL: "Oslo Gardermoen", JFK: "New York JFK", LAX: "Los Angeles", PDX: "Portland, Oregon", DXB: "Dubai", SIN: "Singapore", HND: "Tokyo Haneda", CPT: "Cape Town", SYD: "Sydney", SFO: "San Francisco", SEA: "Seattle", IAH: "Houston", JNB: "Johannesburg",
};

export default async function BookPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const aircraft = typeof params.aircraft === "string" ? params.aircraft : "";
  const from = typeof params.from === "string" ? params.from.toUpperCase() : "LHR";
  const to = typeof params.to === "string" ? params.to.toUpperCase() : "OSL";
  const date = typeof params.date === "string" ? params.date : getTomorrowIsoDate();
  const flights = aircraft
    ? await getFlightsForAircraft(aircraft, date)
    : from === to ? [] : await getFlightsForRoute(from, to, date);
  const pilotSession = await getPilotSession();
  const unavailable = params.error === "unavailable";

  return (
    <>
      <SiteHeader />
      <main className="page-shell">
        <div className="page-container">
          <div className="booking-steps"><div className="booking-step active"><span>1</span>Choose virtual flight</div><div className="booking-step"><span>2</span>Flight briefing</div><div className="booking-step"><span>3</span>Confirm assignment</div></div>
          <section className="page-heading booking-heading">
            <div>
              <div className="section-kicker">BAV scheduled flights</div>
              <h1>{aircraft ? `${aircraft} routes` : `${airportNames[from] ?? from} (${from}) → ${airportNames[to] ?? to} (${to})`}</h1>
              <p>{date} · British Airways Virtual operational schedule · In-house system</p>
              {aircraft ? <p>Showing active BAV services scheduled with this airframe type. Registration assignment is intentionally handled later.</p> : null}
            </div>
            <Link className="button button-outline" href="/#flight-search">Edit search</Link>
          </section>
          {unavailable ? <div className="integration-note"><strong>Flight no longer available:</strong> the selected BAV assignment may have filled or been disabled by Operations. Choose another available service.</div> : null}
          <div className="booking-results-heading">
            <h2>{aircraft ? `Current routes for ${aircraft}` : "Available virtual flights"}</h2>
            <p>{flights.length} BAV scheduled service{flights.length === 1 ? "" : "s"} found.</p>
          </div>
          <div className="flight-results">
            {flights.length ? flights.map((flight) => (
              <article className="result-flight card" key={flight.routeId}>
                <div className="result-times"><div><strong>{flight.departure}</strong><span>{flight.from}</span></div><div className="result-line"><span>{flight.duration}</span><i /></div><div><strong>{flight.arrival}</strong><span>{flight.to}</span></div></div>
                <div className="result-meta"><strong>{flight.number} · British Airways Virtual</strong><span>{airportNames[flight.from] ?? flight.from} → {airportNames[flight.to] ?? flight.to}</span><span>{flight.aircraft} · Non-stop virtual service</span></div>
                <div className="result-availability"><strong>{flight.slots > 0 ? "● Available" : "● Full"}</strong><span>{flight.slots} of {flight.capacity} pilot slots open</span></div>
                {pilotSession ? (
                  flight.slots > 0 ? <form action={bookFlight}>
                    <input type="hidden" name="from" value={flight.from} /><input type="hidden" name="to" value={flight.to} /><input type="hidden" name="date" value={date} /><input type="hidden" name="flightNumber" value={flight.number} /><input type="hidden" name="routeId" value={flight.routeId} />
                    <button className="button button-primary" type="submit">Select flight</button>
                  </form> : <button className="button button-primary" type="button" disabled>Flight full</button>
                ) : <Link className="button button-primary" href="/login">Log in to book</Link>}
              </article>
            )) : <div className="empty-state card"><h2>{aircraft ? "No current routes published for this airframe" : "No BAV schedule published"}</h2><p>{aircraft ? `Operations has not published an active BAV service using ${aircraft} for this date.` : "There is currently no active British Airways Virtual service for this city pair. Staff can add or enable services in the Staff Centre."}</p><Link className="button button-primary" href="/">Return to flight search</Link></div>}
          </div>
          <div className="integration-note"><strong>In-house BAV schedule:</strong> route availability comes from the staff-managed BAV schedule and live assignment capacity. Airframe selection filters by aircraft type, not registration; registration assignment can be added later without changing the route search.</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
