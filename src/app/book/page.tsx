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
import { toBritishAirwaysCallsign } from "@/lib/ba-flight-identifiers";
import { bookFlight } from "./actions";

export const dynamic = "force-dynamic";

const airportNames: Record<string, string> = {
  LHR: "London Heathrow", LGW: "London Gatwick", LCY: "London City", OSL: "Oslo Gardermoen", JFK: "New York JFK", LAX: "Los Angeles", PDX: "Portland, Oregon", DXB: "Dubai", SIN: "Singapore", HND: "Tokyo Haneda", CPT: "Cape Town", SYD: "Sydney", SFO: "San Francisco", SEA: "Seattle", IAH: "Houston", JNB: "Johannesburg",
};

function airportName(code: string) {
  return airportByCode[code]?.name ?? airportNames[code] ?? code;
}

function callsignLabel(flightNumber: string, callsign?: string) {
  const virtualNumber = /^BAV(\d{1,5})$/i.exec(flightNumber.trim())?.[1];
  if (virtualNumber) return `${toBritishAirwaysCallsign(callsign ?? flightNumber)} · BAV virtual service`;
  const number = /^BA(\d{1,4})$/i.exec(flightNumber.trim())?.[1];
  if (!number) return callsign ?? null;
  return `${callsign ?? `BAW${number}`} · SPEEDBIRD ${number}`;
}

function durationToMinutes(value: string) {
  const match = /^(\d+)\s*h(?:\s*(\d+)\s*m)?$/i.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2] ?? 0);
}

function durationHoursParam(value: string | string[] | undefined) {
  if (typeof value !== "string" || !value.trim()) return null;
  const hours = Number(value);
  return Number.isFinite(hours) && hours >= 0 && hours <= 24 ? hours : null;
}

function hourLabel(hours: number) {
  return `${hours} hour${hours === 1 ? "" : "s"}`;
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
  const minimumHours = durationHoursParam(params.minHours);
  const maximumHours = durationHoursParam(params.maxHours);
  const hasDurationFilter = minimumHours !== null || maximumHours !== null;
  const invalidDurationRange = minimumHours !== null && maximumHours !== null && minimumHours > maximumHours;
  const scheduledFlights = hub
    ? await getFlightsFromHub(hub.code, date, { includeVirtualFlexible: flexible })
    : hasCityPair && from !== to
      ? await getFlightsForRoute(from, to, date, { includeVirtualFlexible: flexible })
      : aircraft
        ? await getFlightsForAircraft(aircraft, date)
        : [];
  const aircraftFlights = aircraft && (hub || hasCityPair)
    ? scheduledFlights.filter((flight) => !flight.catalogueOnly && (flight.aircraft === aircraft || flight.aircraftOptions?.includes(aircraft)))
    : scheduledFlights;
  const flights = invalidDurationRange ? [] : aircraftFlights.filter((flight) => {
    if (!hasDurationFilter) return true;
    if (flight.catalogueOnly) return false;
    const minutes = durationToMinutes(flight.duration);
    return minutes !== null &&
      (minimumHours === null || minutes >= minimumHours * 60) &&
      (maximumHours === null || minutes <= maximumHours * 60);
  });
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
  if (minimumHours !== null) flexibleParams.set("minHours", String(minimumHours));
  if (maximumHours !== null) flexibleParams.set("maxHours", String(maximumHours));
  const clearDurationFilterParams = new URLSearchParams({ date });
  if (hub) clearDurationFilterParams.set("hub", hub.code);
  else if (hasCityPair) { clearDurationFilterParams.set("from", from); clearDurationFilterParams.set("to", to); }
  if (aircraft) clearDurationFilterParams.set("aircraft", aircraft);
  if (flexible) clearDurationFilterParams.set("flexible", "1");
  const durationRangeLabel = minimumHours !== null && maximumHours !== null
    ? `${hourLabel(minimumHours)} to ${hourLabel(maximumHours)}`
    : minimumHours !== null
      ? `${hourLabel(minimumHours)} or longer`
      : maximumHours !== null
        ? `up to ${hourLabel(maximumHours)}`
        : null;

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
              <p>{date} · {flexible ? "virtual-flexible BAV service catalogue" : "BAV London-hub route catalogue"} · flight-simulation planning times</p>
              {aircraft ? <p>Showing only routes that can operate with {aircraft}. Reserve a matching registration in Ember after choosing a service.</p> : null}
              {hub ? <p>{hub.role}. {hubRouteCount} published airport-pair routes are available from this hub. A confirmed BA timetable replaces the BAV virtual service when Operations publishes it.</p> : null}
              {flexible ? <p><strong>Fly when it suits you:</strong> schedules are simulator-flexible references, not a required departure time.</p> : null}
            </div>
            <Link className="button button-outline" href="/#flight-search">Edit search</Link>
          </section>
          {unavailable ? <div className="integration-note"><strong>Flight no longer available:</strong> the selected BAV assignment may have filled or been disabled by Operations. Choose another available service.</div> : null}
          {qualificationError ? <div className="integration-note"><strong>Qualification required:</strong> this service is outside your current rank or type-rating approval. Review your pilot profile or contact Operations after meeting the required criteria.</div> : null}
          {aircraftError ? <div className="integration-note"><strong>Aircraft selection unavailable:</strong> choose the published scheduled aircraft or an Operations-approved virtual substitute that your current rank and type ratings permit.</div> : null}
          <form className="booking-duration-filter card" action="/book">
            {hub ? <input type="hidden" name="hub" value={hub.code} /> : null}
            {hasCityPair ? <><input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} /></> : null}
            {aircraft ? <input type="hidden" name="aircraft" value={aircraft} /> : null}
            <input type="hidden" name="date" value={date} />
            {flexible ? <input type="hidden" name="flexible" value="1" /> : null}
            <div className="booking-duration-copy"><strong>Filter by flight time</strong><span>Set a range in hours to find routes that fit your available flying time.</span></div>
            <div className="booking-duration-fields">
              <label><span>From</span><input type="number" name="minHours" min="0" max="24" step="1" inputMode="numeric" placeholder="Any" defaultValue={minimumHours ?? ""} /><em>hours</em></label>
              <label><span>To</span><input type="number" name="maxHours" min="0" max="24" step="1" inputMode="numeric" placeholder="Any" defaultValue={maximumHours ?? ""} /><em>hours</em></label>
            </div>
            <div className="booking-duration-actions"><button className="button button-primary" type="submit">Apply filter</button>{hasDurationFilter ? <Link className="button button-outline" href={`/book?${clearDurationFilterParams.toString()}`}>Clear</Link> : null}</div>
          </form>
          {invalidDurationRange ? <div className="integration-note"><strong>Check the flight-time range:</strong> the minimum duration must be less than or equal to the maximum duration.</div> : null}
          <div className="booking-results-heading">
            <h2>{aircraft && !hasCityPair && !hub ? `Current routes for ${aircraft}` : hub ? `Available departures from ${hub.code}` : "Available BAV routes"}</h2>
            <p>{distinctRouteCount} BAV airport-pair route{distinctRouteCount === 1 ? "" : "s"} found{hubRouteCount && hubCode ? ` of ${hubRouteCount} published from ${hubCode}` : ""}{durationRangeLabel ? ` · ${durationRangeLabel}` : ""}.</p>
          </div>
          <div className="flight-results">
            {flights.length ? flights.map((flight) => {
              const catalogueOnly = flight.catalogueOnly;
              const virtualTimetable = flight.virtualTimetable;
              const eligibility = !catalogueOnly && pilot ? getPilotAircraftEligibility({ rank: pilot.rank, typeRatings: pilot.typeRatings, aircraft: flight.aircraft }) : null;
              const approvedAircraft = catalogueOnly ? [] : Array.from(new Set([flight.aircraft, ...(flight.aircraftOptions ?? [])]));
              const eligibleAircraft = pilot ? approvedAircraft.filter((candidate) => getPilotAircraftEligibility({ rank: pilot.rank, typeRatings: pilot.typeRatings, aircraft: candidate }).eligible) : [];
              const selectedAircraft = aircraft && eligibleAircraft.includes(aircraft) ? aircraft : eligibleAircraft.includes(flight.aircraft) ? flight.aircraft : (eligibleAircraft[0] ?? flight.aircraft);
              return <article className="result-flight card" key={flight.routeId}>
                <div className="result-times"><div><strong>{catalogueOnly ? "BA" : flight.departure}</strong><span>{flight.from}</span></div><div className="result-line"><span>{catalogueOnly ? "Network route" : flight.duration}</span><i /></div><div><strong>{catalogueOnly ? "Route" : flight.arrival}</strong><span>{flight.to}</span></div></div>
                <div className="result-meta"><strong>{catalogueOnly ? "British Airways network city pair" : virtualTimetable ? `${flight.number} · BAV virtual service` : `${flight.number} · British Airways`}</strong><span>{airportName(flight.from)} → {airportName(flight.to)}</span><span>{catalogueOnly ? "Flight number, local airport times and aircraft will appear once Operations publishes a verified schedule." : `${callsignLabel(flight.number, flight.callsign) ?? "Callsign pending"} · ${flight.aircraft} · ${virtualTimetable ? "BAV UTC reference schedule" : flight.scheduledForSelectedDate ? "Scheduled equipment" : "Virtual-flexible assignment"}`}</span></div>
                <div className="result-availability"><strong>{catalogueOnly ? "○ Timetable pending" : flight.slots > 0 ? "● Available" : "● Full"}</strong><span>{catalogueOnly ? "BA route confirmed · detailed service validation in progress" : virtualTimetable ? `${flight.slots} of ${flight.capacity} pilot slots open · BAV scheduling` : `${flight.slots} of ${flight.capacity} pilot slots open`}</span></div>
                {catalogueOnly ? <button className="button button-outline" type="button" disabled>Awaiting verified timetable</button> : pilotSession && pilot ? (
                  flight.slots > 0 && eligibleAircraft.length > 0 ? <form action={bookFlight}>
                    <input type="hidden" name="from" value={flight.from} /><input type="hidden" name="to" value={flight.to} /><input type="hidden" name="date" value={date} /><input type="hidden" name="flightNumber" value={flight.number} /><input type="hidden" name="routeId" value={flight.routeId} />{flexible ? <input type="hidden" name="flexible" value="1" /> : null}
                    {eligibleAircraft.length > 1 ? <label className="booking-aircraft-choice"><span>Virtual aircraft</span><select name="aircraft" defaultValue={selectedAircraft}>{eligibleAircraft.map((candidate) => <option key={candidate} value={candidate}>{candidate}{candidate === flight.aircraft ? " · scheduled" : " · approved substitute"}</option>)}</select></label> : <input type="hidden" name="aircraft" value={selectedAircraft} />}
                    <button className="button button-primary" type="submit">{virtualTimetable ? "Select BAV service" : "Select flight"}</button>
                  </form> : flight.slots > 0 && eligibility && !eligibility.eligible ? <div className="pilot-qualification-lock"><button className="button button-primary" type="button" disabled>Qualification required</button><span>{eligibility.reason}</span></div> : <button className="button button-primary" type="button" disabled>Flight full</button>
                ) : <Link className="button button-primary" href="/login">Log in to book</Link>}
              </article>;
            }) : <div className="empty-state card"><h2>{invalidDurationRange ? "Choose a valid flight-time range" : hasDurationFilter ? "No BAV routes in this flight-time range" : aircraft ? "No current routes published for this airframe" : "No BAV route published"}</h2><p>{invalidDurationRange ? "Set the first hour at or below the second hour, then apply the filter again." : hasDurationFilter ? "Try a wider range or clear the filter to see every available route." : aircraft ? `Operations has not published an active BAV service using ${aircraft} for this date.` : hub ? `There is currently no active British Airways Virtual route departing ${hub.name}.` : "There is currently no active British Airways Virtual route for this city pair."}</p>{!hasDurationFilter && !flexible && (hub || hasCityPair) ? <><p>You can still book a real BAV service as a virtual-flexible assignment and fly it when it suits you.</p><Link className="button button-primary" href={`/book?${flexibleParams.toString()}`}>Show virtual-flexible services</Link></> : <Link className="button button-primary" href={hasDurationFilter ? `/book?${clearDurationFilterParams.toString()}` : "/"}>{hasDurationFilter ? "Clear flight-time filter" : "Return to flight search"}</Link>}</div>}
          </div>
          <div className="integration-note"><strong>Route coverage and schedule accuracy:</strong> every city pair in this catalogue is maintained as part of the BAV London-hub network. A BAV virtual service is bookable now with a BAV service reference, a UTC planning window and rank-approved aircraft; it is not presented as a real BA flight number, callsign or timetable. When Operations verifies a BA service, its real flight number, callsign, local times and scheduled aircraft replace the virtual service. Pilots may fly every BAV service at a simulator-friendly time.</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
