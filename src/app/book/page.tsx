import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getPilotSession } from "@/lib/pilot-auth";
import { getTomorrowIsoDate } from "@/lib/serverDate";
import { getFlightsForAircraft, getFlightsForRoute, getFlightsFromHub } from "@/lib/route-store";
import { getBavHub } from "@/lib/hubs";
import { airportByCode } from "@/data/airports";
import { getPilotAircraftEligibility } from "@/lib/pilot-ranks";
import { getPilotById } from "@/lib/pilot-store";
import { bookFlight } from "./actions";

export const dynamic = "force-dynamic";

const airportNames: Record<string, string> = {
  LHR: "London Heathrow", LGW: "London Gatwick", LCY: "London City", OSL: "Oslo Gardermoen", JFK: "New York JFK", LAX: "Los Angeles", PDX: "Portland, Oregon", DXB: "Dubai", SIN: "Singapore", HND: "Tokyo Haneda", CPT: "Cape Town", SYD: "Sydney", SFO: "San Francisco", SEA: "Seattle", IAH: "Houston", JNB: "Johannesburg",
};

function airportName(code: string) {
  return airportByCode[code]?.name ?? airportNames[code] ?? code;
}

export default async function BookPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const aircraft = typeof params.aircraft === "string" ? params.aircraft : "";
  const from = typeof params.from === "string" ? params.from.toUpperCase() : "LHR";
  const to = typeof params.to === "string" ? params.to.toUpperCase() : "OSL";
  const hasCityPair = typeof params.from === "string" && typeof params.to === "string";
  const hub = getBavHub(typeof params.hub === "string" ? params.hub : null);
  const date = typeof params.date === "string" ? params.date : getTomorrowIsoDate();
  const flexible = params.flexible === "1";
  const scheduledFlights = hub
    ? await getFlightsFromHub(hub.code, date, { includeVirtualFlexible: flexible })
    : hasCityPair && from !== to
      ? await getFlightsForRoute(from, to, date, { includeVirtualFlexible: flexible })
      : aircraft
        ? await getFlightsForAircraft(aircraft, date)
        : [];
  const flights = aircraft && (hub || hasCityPair)
    ? scheduledFlights.filter((flight) => flight.aircraft === aircraft)
    : scheduledFlights;
  const pilotSession = await getPilotSession();
  const pilot = pilotSession ? await getPilotById(pilotSession.pilotId) : null;
  const unavailable = params.error === "unavailable";
  const qualificationError = params.error === "qualification";
  const flexibleParams = new URLSearchParams({ date, flexible: "1" });
  if (hub) flexibleParams.set("hub", hub.code);
  else if (hasCityPair) { flexibleParams.set("from", from); flexibleParams.set("to", to); }
  if (aircraft) flexibleParams.set("aircraft", aircraft);

  return (
    <>
      <SiteHeader />
      <main className="page-shell">
        <div className="page-container">
          <div className="booking-steps"><div className="booking-step active"><span>1</span>Choose virtual flight</div><div className="booking-step"><span>2</span>Flight briefing</div><div className="booking-step"><span>3</span>Confirm assignment</div></div>
          <section className="page-heading booking-heading">
            <div>
              <div className="section-kicker">BAV scheduled flights</div>
              <h1>{aircraft && !hasCityPair && !hub ? `${aircraft} routes` : hub ? `Flights departing ${hub.name} (${hub.code})` : `${airportName(from)} (${from}) → ${airportName(to)} (${to})`}</h1>
              <p>{date} · {flexible ? "virtual-flexible BAV service catalogue" : "verified British Airways schedule records"} · UTC</p>
              {aircraft ? <p>Showing only services scheduled with {aircraft}. Reserve a matching registration in Ember after choosing a service.</p> : null}
              {hub ? <p>{hub.role}. Showing every active BAV {flexible ? "service available as a virtual-flexible assignment" : "service currently scheduled"} from this hub.</p> : null}
              {flexible ? <p><strong>Fly when it suits you:</strong> these are real BAV services offered as simulator-flexible assignments. The published schedule remains a reference, not a required departure time.</p> : null}
            </div>
            <Link className="button button-outline" href="/#flight-search">Edit search</Link>
          </section>
          {unavailable ? <div className="integration-note"><strong>Flight no longer available:</strong> the selected BAV assignment may have filled or been disabled by Operations. Choose another available service.</div> : null}
          {qualificationError ? <div className="integration-note"><strong>Qualification required:</strong> this service is outside your current rank or type-rating approval. Review your pilot profile or contact Operations after meeting the required criteria.</div> : null}
          <div className="booking-results-heading">
            <h2>{aircraft && !hasCityPair && !hub ? `Current routes for ${aircraft}` : hub ? `Available departures from ${hub.code}` : "Available virtual flights"}</h2>
            <p>{flights.length} BAV scheduled service{flights.length === 1 ? "" : "s"} found.</p>
          </div>
          <div className="flight-results">
            {flights.length ? flights.map((flight) => {
              const eligibility = pilot ? getPilotAircraftEligibility({ rank: pilot.rank, typeRatings: pilot.typeRatings, aircraft: flight.aircraft }) : null;
              return <article className="result-flight card" key={flight.routeId}>
                <div className="result-times"><div><strong>{flight.departure}</strong><span>{flight.from}</span></div><div className="result-line"><span>{flight.duration}</span><i /></div><div><strong>{flight.arrival}</strong><span>{flight.to}</span></div></div>
                <div className="result-meta"><strong>{flight.number} · British Airways</strong><span>{airportName(flight.from)} → {airportName(flight.to)}</span><span>{flight.aircraft} · {flight.scheduledForSelectedDate ? "Scheduled equipment" : "Virtual-flexible assignment"}</span></div>
                <div className="result-availability"><strong>{flight.slots > 0 ? "● Available" : "● Full"}</strong><span>{flight.slots} of {flight.capacity} pilot slots open</span></div>
                {pilotSession && pilot ? (
                  flight.slots > 0 && eligibility?.eligible ? <form action={bookFlight}>
                    <input type="hidden" name="from" value={flight.from} /><input type="hidden" name="to" value={flight.to} /><input type="hidden" name="date" value={date} /><input type="hidden" name="flightNumber" value={flight.number} /><input type="hidden" name="routeId" value={flight.routeId} />{flexible ? <input type="hidden" name="flexible" value="1" /> : null}
                    <button className="button button-primary" type="submit">Select flight</button>
                  </form> : eligibility && !eligibility.eligible ? <div className="pilot-qualification-lock"><button className="button button-primary" type="button" disabled>Qualification required</button><span>{eligibility.reason}</span></div> : <button className="button button-primary" type="button" disabled>Flight full</button>
                ) : <Link className="button button-primary" href="/login">Log in to book</Link>}
              </article>;
            }) : <div className="empty-state card"><h2>{aircraft ? "No current routes published for this airframe" : "No BAV schedule published"}</h2><p>{aircraft ? `Operations has not published an active BAV service using ${aircraft} for this date.` : hub ? `There is currently no active British Airways Virtual service departing ${hub.name}.` : "There is currently no active British Airways Virtual service for this city pair."}</p>{!flexible && (hub || hasCityPair) ? <><p>You can still book a real BAV service as a virtual-flexible assignment and fly it when it suits you.</p><Link className="button button-primary" href={`/book?${flexibleParams.toString()}`}>Show virtual-flexible services</Link></> : <Link className="button button-primary" href="/">Return to flight search</Link>}</div>}
          </div>
          <div className="integration-note"><strong>Schedule accuracy and flexibility:</strong> BAV publishes verified British Airways service records with real BA flight numbers and UTC times. The schedule is a realism reference, not a real-world departure gate: pilots can choose a virtual-flexible service when its published day or time does not suit their simulator session. Ember still requires a matching fleet registration so hours, cycles and logbook credit remain accurate.</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
