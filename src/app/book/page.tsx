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
import { BAV_NETWORK_ROUTE_COUNTS } from "@/data/bav-network-2026";
import { bookFlight } from "./actions";

export const dynamic = "force-dynamic";

const airportNames: Record<string, string> = {
  LHR: "London Heathrow", LGW: "London Gatwick", LCY: "London City", OSL: "Oslo Gardermoen", JFK: "New York JFK", LAX: "Los Angeles", PDX: "Portland, Oregon", DXB: "Dubai", SIN: "Singapore", HND: "Tokyo Haneda", CPT: "Cape Town", SYD: "Sydney", SFO: "San Francisco", SEA: "Seattle", IAH: "Houston", JNB: "Johannesburg",
};

function airportName(code: string) {
  return airportByCode[code]?.name ?? airportNames[code] ?? code;
}

function callsignLabel(flightNumber: string, callsign?: string) {
  const number = /^BA(\d{1,4})$/i.exec(flightNumber.trim())?.[1];
  if (!number) return callsign ?? null;
  return `${callsign ?? `BAW${number}`} · SPEEDBIRD ${number}`;
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
  const distinctRouteCount = new Set(flights.map((flight) => `${flight.from}-${flight.to}`)).size;
  const hubRouteCount = hub ? BAV_NETWORK_ROUTE_COUNTS[hub.code] : null;
  const hubCode = hub?.code ?? null;
  const pilotSession = await getPilotSession();
  const pilot = pilotSession ? await getPilotById(pilotSession.pilotId) : null;
  const unavailable = params.error === "unavailable";
  const qualificationError = params.error === "qualification";
  const aircraftError = params.error === "aircraft";
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
              <div className="section-kicker">BAV London-hub network</div>
              <h1>{aircraft && !hasCityPair && !hub ? `${aircraft} routes` : hub ? `Flights departing ${hub.name} (${hub.code})` : `${airportName(from)} (${from}) → ${airportName(to)} (${to})`}</h1>
              <p>{date} · {flexible ? "virtual-flexible BAV service catalogue" : "British Airways London-hub route catalogue"} · local airport times</p>
              {aircraft ? <p>Showing only services scheduled with {aircraft}. Reserve a matching registration in Ember after choosing a service.</p> : null}
              {hub ? <p>{hub.role}. {hubRouteCount} published airport-pair routes are available from this hub. Verified timetable records replace a route card as they are published.</p> : null}
              {flexible ? <p><strong>Fly when it suits you:</strong> verified BAV services are offered as simulator-flexible assignments. The published schedule remains a reference, not a required departure time; route cards stay unavailable until their detailed BA timetable is validated.</p> : null}
            </div>
            <Link className="button button-outline" href="/#flight-search">Edit search</Link>
          </section>
          {unavailable ? <div className="integration-note"><strong>Flight no longer available:</strong> the selected BAV assignment may have filled or been disabled by Operations. Choose another available service.</div> : null}
          {qualificationError ? <div className="integration-note"><strong>Qualification required:</strong> this service is outside your current rank or type-rating approval. Review your pilot profile or contact Operations after meeting the required criteria.</div> : null}
          {aircraftError ? <div className="integration-note"><strong>Aircraft selection unavailable:</strong> choose the published scheduled aircraft or an Operations-approved virtual substitute that your current rank and type ratings permit.</div> : null}
          <div className="booking-results-heading">
            <h2>{aircraft && !hasCityPair && !hub ? `Current routes for ${aircraft}` : hub ? `Available departures from ${hub.code}` : "Available BAV routes"}</h2>
            <p>{distinctRouteCount} BAV airport-pair route{distinctRouteCount === 1 ? "" : "s"} found{hubRouteCount && hubCode ? ` of ${hubRouteCount} published from ${hubCode}` : ""}.</p>
          </div>
          <div className="flight-results">
            {flights.length ? flights.map((flight) => {
              const catalogueOnly = flight.catalogueOnly;
              const eligibility = !catalogueOnly && pilot ? getPilotAircraftEligibility({ rank: pilot.rank, typeRatings: pilot.typeRatings, aircraft: flight.aircraft }) : null;
              const approvedAircraft = catalogueOnly ? [] : Array.from(new Set([flight.aircraft, ...(flight.aircraftOptions ?? [])]));
              const eligibleAircraft = pilot ? approvedAircraft.filter((candidate) => getPilotAircraftEligibility({ rank: pilot.rank, typeRatings: pilot.typeRatings, aircraft: candidate }).eligible) : [];
              const selectedAircraft = eligibleAircraft.includes(flight.aircraft) ? flight.aircraft : (eligibleAircraft[0] ?? flight.aircraft);
              return <article className="result-flight card" key={flight.routeId}>
                <div className="result-times"><div><strong>{catalogueOnly ? "BA" : flight.departure}</strong><span>{flight.from}</span></div><div className="result-line"><span>{catalogueOnly ? "Network route" : flight.duration}</span><i /></div><div><strong>{catalogueOnly ? "Route" : flight.arrival}</strong><span>{flight.to}</span></div></div>
                <div className="result-meta"><strong>{catalogueOnly ? "British Airways network city pair" : `${flight.number} · British Airways`}</strong><span>{airportName(flight.from)} → {airportName(flight.to)}</span><span>{catalogueOnly ? "Flight number, local airport times and aircraft will appear once Operations publishes a verified schedule." : `${callsignLabel(flight.number, flight.callsign) ?? "Callsign pending"} · ${flight.aircraft} · ${flight.scheduledForSelectedDate ? "Scheduled equipment" : "Virtual-flexible assignment"}`}</span></div>
                <div className="result-availability"><strong>{catalogueOnly ? "○ Timetable pending" : flight.slots > 0 ? "● Available" : "● Full"}</strong><span>{catalogueOnly ? "BA route confirmed · detailed service validation in progress" : `${flight.slots} of ${flight.capacity} pilot slots open`}</span></div>
                {catalogueOnly ? <button className="button button-outline" type="button" disabled>Awaiting verified timetable</button> : pilotSession && pilot ? (
                  flight.slots > 0 && eligibleAircraft.length > 0 ? <form action={bookFlight}>
                    <input type="hidden" name="from" value={flight.from} /><input type="hidden" name="to" value={flight.to} /><input type="hidden" name="date" value={date} /><input type="hidden" name="flightNumber" value={flight.number} /><input type="hidden" name="routeId" value={flight.routeId} />{flexible ? <input type="hidden" name="flexible" value="1" /> : null}
                    {eligibleAircraft.length > 1 ? <label className="booking-aircraft-choice"><span>Virtual aircraft</span><select name="aircraft" defaultValue={selectedAircraft}>{eligibleAircraft.map((candidate) => <option key={candidate} value={candidate}>{candidate}{candidate === flight.aircraft ? " · scheduled" : " · approved substitute"}</option>)}</select></label> : <input type="hidden" name="aircraft" value={selectedAircraft} />}
                    <button className="button button-primary" type="submit">Select flight</button>
                  </form> : flight.slots > 0 && eligibility && !eligibility.eligible ? <div className="pilot-qualification-lock"><button className="button button-primary" type="button" disabled>Qualification required</button><span>{eligibility.reason}</span></div> : <button className="button button-primary" type="button" disabled>Flight full</button>
                ) : <Link className="button button-primary" href="/login">Log in to book</Link>}
              </article>;
            }) : <div className="empty-state card"><h2>{aircraft ? "No current routes published for this airframe" : "No BAV route published"}</h2><p>{aircraft ? `Operations has not published an active BAV service using ${aircraft} for this date.` : hub ? `There is currently no active British Airways Virtual route departing ${hub.name}.` : "There is currently no active British Airways Virtual route for this city pair."}</p>{!flexible && (hub || hasCityPair) ? <><p>You can still book a real BAV service as a virtual-flexible assignment and fly it when it suits you.</p><Link className="button button-primary" href={`/book?${flexibleParams.toString()}`}>Show virtual-flexible services</Link></> : <Link className="button button-primary" href="/">Return to flight search</Link>}</div>}
          </div>
          <div className="integration-note"><strong>Route coverage and schedule accuracy:</strong> every London-hub city pair in this catalogue is a published BA network route. A route becomes bookable only when BAV has verified its BA flight number, local airport times and scheduled aircraft; this prevents a guessed callsign or airframe from entering a pilot’s OFP, logbook or fleet record. A verified service defaults to its published aircraft; where Operations has approved substitutes, the selector shows only types permitted by your BAV rank and type ratings. Once published, pilots can still choose a virtual-flexible service when the real-world time does not suit their simulator session.</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
