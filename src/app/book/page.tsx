import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

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

function createFlights(from: string, to: string) {
  const longHaul = ["JFK", "LAX", "PDX", "DXB", "SIN", "HND", "CPT", "SYD"].includes(to);
  return longHaul
    ? [
        { number: "BA117", departure: "08:20", arrival: "11:15", duration: "7h 55m", aircraft: "Boeing 777-200ER", slots: 10 },
        { number: "BA175", departure: "09:45", arrival: "12:40", duration: "7h 55m", aircraft: "Boeing 777-300ER", slots: 4 },
        { number: "BA183", departure: "19:05", arrival: "22:00", duration: "7h 55m", aircraft: "Airbus A350-1000", slots: 12 },
      ]
    : [
        { number: "BA762", departure: "07:35", arrival: "10:45", duration: "2h 10m", aircraft: "Airbus A320neo", slots: 11 },
        { number: "BA766", departure: "13:10", arrival: "16:20", duration: "2h 10m", aircraft: "Airbus A320", slots: 6 },
        { number: "BA770", departure: "19:25", arrival: "22:35", duration: "2h 10m", aircraft: "Airbus A320neo", slots: 9 },
      ];
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const from = typeof params.from === "string" ? params.from : "LHR";
  const to = typeof params.to === "string" ? params.to : "OSL";
  const date = typeof params.date === "string" ? params.date : new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const flights = from === to ? [] : createFlights(from, to);

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
            <p>{flights.length} pilot assignments available for this mock production schedule.</p>
          </div>

          <div className="flight-results">
            {flights.length ? flights.map((flight) => (
              <article className="result-flight card" key={flight.number}>
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
            <strong>Production note:</strong> these results currently use mock schedule data. The page structure is ready for the real schedule database so only genuinely available pilot assignments are returned.
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
