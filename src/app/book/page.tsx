import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getTomorrowIsoDate } from "@/lib/serverDate";
import { getFlightsForRoute } from "@/lib/route-store";

export const dynamic = "force-dynamic";

const airportNames: Record<string, string> = {
  LHR: "London Heathrow",
  LGW: "London Gatwick",
  LCY: "London City",
  OSL: "Oslo Gardermoen",
  JFK: "New York JFK",
  LAX: "Los Angeles",
  PDX: "Portland, Oregon",
  DXB: "Dubai",
  SIN: "Singapore",
  HND: "Tokyo Haneda",
  CPT: "Cape Town",
  SYD: "Sydney",
};

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const from = typeof params.from === "string" ? params.from.toUpperCase() : "LHR";
  const to = typeof params.to === "string" ? params.to.toUpperCase() : "OSL";
  const date = typeof params.date === "string" ? params.date : getTomorrowIsoDate();
  const flights = from === to ? [] : await getFlightsForRoute(from, to);

  return (
    <>
      <SiteHeader />
      <main className="page-shell">
        <div className="page-container">
          <div className="booking-steps">
            <div className="booking-step active"><span>1</span>Choose virtual flight</div>
            <div className="booking-step"><span>2</span>Flight briefing</div>
            <div className="booking-step"><span>3</span>Confirm assignment</div>
          </div>

          <section className="page-heading booking-heading">
            <div>
              <div className="section-kicker">Scheduled flights</div>
              <h1>{airportNames[from] ?? from} ({from}) → {airportNames[to] ?? to} ({to})</h1>
              <p>{date} · Virtual pilot assignment search · Phoenix-ready workflow</p>
            </div>
            <Link className="button button-outline" href="/#flight-search">Edit search</Link>
          </section>

          <div className="booking-results-heading">
            <h2>Available virtual flights</h2>
            <p>{flights.length} pilot assignments available for this virtual schedule.</p>
          </div>

          <div className="flight-results">
            {flights.length ? flights.map((flight) => (
              <article className="result-flight card" key={`${flight.number}-${flight.departure}`}>
                <div className="result-times">
                  <div><strong>{flight.departure}</strong><span>{from}</span></div>
                  <div className="result-line"><span>{flight.duration}</span><i /></div>
                  <div><strong>{flight.arrival}</strong><span>{to}</span></div>
                </div>
                <div className="result-meta">
                  <strong>{flight.number} · British Airways Virtual</strong>
                  <span>{flight.aircraft}</span>
                  <span>Non-stop virtual service</span>
                </div>
                <div className="result-availability">
                  <strong>● Available</strong>
                  <span>{flight.slots} pilot slots open</span>
                </div>
                <Link
                  className="button button-primary"
                  href={`/account?assignment=${flight.number}&from=${from}&to=${to}`}
                >
                  Select flight
                </Link>
              </article>
            )) : (
              <div className="empty-state card">
                <h2>No available direct flights</h2>
                <p>Choose two different airports and search again.</p>
                <Link className="button button-primary" href="/">Return to flight search</Link>
              </div>
            )}
          </div>

          <div className="integration-note">
            <strong>Schedule note:</strong> staff-created route overrides are used when available. Routes without an override continue to use the current development schedule until the shared vAMSYS schedule source is connected.
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
