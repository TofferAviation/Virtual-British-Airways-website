import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getPilotSession } from "@/lib/pilot-auth";
import { getTomorrowIsoDate } from "@/lib/serverDate";
import { getFlightsForAircraft, getFlightsForRoute, getFlightsFromStation } from "@/lib/route-store";
import { getBavHub } from "@/lib/hubs";
import { airportByCode } from "@/data/airports";
import { getPilotAircraftEligibility } from "@/lib/pilot-ranks";
import { getPilotById } from "@/lib/pilot-store";
import { resolveBritishAirwaysCallsign } from "@/lib/ba-flight-identifiers";
import { fleetAircraftIsAtStation, fleetAircraftMatchesVirtualType, isFleetAircraftBookable, listFleetAircraft } from "@/lib/fleet-service";
import { bookFlight } from "./actions";
import { BookingAssignmentControls } from "./BookingAssignmentControls";

export const dynamic = "force-dynamic";

const airportNames: Record<string, string> = {
  LHR: "London Heathrow", LGW: "London Gatwick", LCY: "London City", OSL: "Oslo Gardermoen", JFK: "New York JFK", LAX: "Los Angeles", PDX: "Portland, Oregon", DXB: "Dubai", SIN: "Singapore", HND: "Tokyo Haneda", CPT: "Cape Town", SYD: "Sydney", SFO: "San Francisco", SEA: "Seattle", IAH: "Houston", JNB: "Johannesburg",
};

function airportName(code: string) {
  return airportByCode[code]?.name ?? airportNames[code] ?? code;
}

function callsignLabel(flightNumber: string, callsign?: string, referenceOnly = false) {
  const identifier = resolveBritishAirwaysCallsign(flightNumber, callsign);
  return `${identifier} · ${referenceOnly ? "observed ICAO identifier" : "checked ICAO identifier"}`;
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
  const hasDeparture = typeof params.from === "string" && Boolean(from);
  const hub = getBavHub(typeof params.hub === "string" ? params.hub : null);
  const departureStation = hub?.code ?? (hasDeparture ? from : null);
  const date = typeof params.date === "string" ? params.date : getTomorrowIsoDate();
  const flexible = params.flexible === "1";
  const minimumHours = durationHoursParam(params.minHours);
  const maximumHours = durationHoursParam(params.maxHours);
  const hasDurationFilter = minimumHours !== null || maximumHours !== null;
  const invalidDurationRange = minimumHours !== null && maximumHours !== null && minimumHours > maximumHours;
  const flightSearchOptions = {
    includeVirtualFlexible: flexible,
    ...(minimumHours !== null ? { minDurationMinutes: minimumHours * 60 } : {}),
    ...(maximumHours !== null ? { maxDurationMinutes: maximumHours * 60 } : {}),
  };
  const scheduledFlights = hasCityPair && from !== to
      ? await getFlightsForRoute(from, to, date, flightSearchOptions)
      : departureStation
        ? await getFlightsFromStation(departureStation, date, flightSearchOptions)
      : aircraft
        ? await getFlightsForAircraft(aircraft, date)
        : [];
  const aircraftFlights = aircraft && (departureStation || hasCityPair)
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
  const pilotSession = await getPilotSession();
  const pilot = pilotSession ? await getPilotById(pilotSession.pilotId) : null;
  const fleetAircraft = pilot ? await listFleetAircraft().catch(() => []) : [];
  const unavailable = params.error === "unavailable";
  const qualificationError = params.error === "qualification";
  const aircraftError = params.error === "aircraft";
  const registrationError = params.error === "registration";
  const stationError = params.error === "station";
  const fleetError = params.error === "fleet";
  const clearDurationFilterParams = new URLSearchParams({ date });
  if (hub) clearDurationFilterParams.set("hub", hub.code);
  else if (hasCityPair) { clearDurationFilterParams.set("from", from); clearDurationFilterParams.set("to", to); }
  else if (departureStation) clearDurationFilterParams.set("from", departureStation);
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
          <div className="booking-steps"><div className="booking-step active"><span>1</span>Choose flight</div><div className="booking-step"><span>2</span>Flight briefing</div><div className="booking-step"><span>3</span>Confirm assignment</div></div>
          <section className="page-heading booking-heading">
            <div>
              <div className="section-kicker">Operational flight schedule</div>
              <h1>{aircraft && !hasCityPair && !departureStation ? `${aircraft} routes` : hasCityPair ? `${airportName(from)} (${from}) → ${airportName(to)} (${to})` : `Flights departing ${airportName(departureStation ?? "LHR")} (${departureStation ?? "LHR"})`}</h1>
              <p>{date} · real BA flight numbers and operating callsigns · flight-simulation planning times</p>
              {aircraft ? <p>Showing only routes that can operate with {aircraft}. Choose a matching registration while booking, or let Ember select one later.</p> : null}
              {hub ? <p>{hub.role}. Services use either an exact date check or a researched 2025–26 operational reference with its observed ICAO identifier.</p> : null}
              {!hub && departureStation ? <p>Real BA services and researched operational references from this station are available to book.</p> : null}
              {flexible ? <p><strong>Flexible planning:</strong> this view includes checked services outside the selected reference date. The displayed identifier remains the verified one.</p> : null}
            </div>
            <Link className="button button-outline" href="/#flight-search">Edit search</Link>
          </section>
          {unavailable ? <div className="integration-note"><strong>Flight no longer available:</strong> the selected service may have filled, expired, or been withdrawn by Operations. Choose another verified service.</div> : null}
          {qualificationError ? <div className="integration-note"><strong>Qualification required:</strong> this service is outside your current rank or type-rating approval. Review your pilot profile or contact Operations after meeting the required criteria.</div> : null}
          {aircraftError ? <div className="integration-note"><strong>Aircraft selection unavailable:</strong> choose the published scheduled aircraft or an Operations-approved virtual substitute that your current rank and type ratings permit.</div> : null}
          {registrationError ? <div className="integration-note"><strong>Registration no longer available:</strong> choose another listed registration or let Ember select one when you are ready to fly.</div> : null}
          {stationError ? <div className="integration-note"><strong>Registration is at another station:</strong> choose an airframe currently parked at {from}, or leave the registration for Ember to select when it is available.</div> : null}
          {fleetError ? <div className="integration-note"><strong>Fleet service unavailable:</strong> the flight can still be booked without a registration. Try selecting an airframe again in Ember once Fleet is available.</div> : null}
          <form className="booking-duration-filter card" action="/book">
            {hub ? <input type="hidden" name="hub" value={hub.code} /> : null}
            {hasCityPair ? <><input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} /></> : null}
            {!hub && !hasCityPair && departureStation ? <input type="hidden" name="from" value={departureStation} /> : null}
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
            <h2>{aircraft && !hasCityPair && !departureStation ? `Current routes for ${aircraft}` : departureStation ? `Available departures from ${departureStation}` : "Available flights"}</h2>
            <p>{distinctRouteCount} operational airport-pair route{distinctRouteCount === 1 ? "" : "s"} found{durationRangeLabel ? ` · ${durationRangeLabel}` : ""}.</p>
          </div>
          <div className="flight-results">
            {flights.length ? flights.map((flight) => {
              const eligibility = pilot ? getPilotAircraftEligibility({ rank: pilot.rank, typeRatings: pilot.typeRatings, aircraft: flight.aircraft }) : null;
              const approvedAircraft = Array.from(new Set([flight.aircraft, ...(flight.aircraftOptions ?? [])]));
              const eligibleAircraft = pilot ? approvedAircraft.filter((candidate) => getPilotAircraftEligibility({ rank: pilot.rank, typeRatings: pilot.typeRatings, aircraft: candidate }).eligible) : [];
              const selectedAircraft = aircraft && eligibleAircraft.includes(aircraft) ? aircraft : eligibleAircraft.includes(flight.aircraft) ? flight.aircraft : (eligibleAircraft[0] ?? flight.aircraft);
              const registrationOptions = Object.fromEntries(eligibleAircraft.map((candidate) => [candidate, fleetAircraft
                .filter((item) => isFleetAircraftBookable(item) && fleetAircraftMatchesVirtualType(item, candidate) && fleetAircraftIsAtStation(item, flight.from))
                .map((item) => ({ id: item.id, registration: item.registration, aircraft: item.aircraftModel, station: item.currentStation }))]));
              return <article className="result-flight card" key={flight.routeId}>
                <div className="result-times"><div><strong>{flight.departure}</strong><span>{flight.from}</span></div><div className="result-line"><span>{flight.duration}</span><i /></div><div><strong>{flight.arrival}</strong><span>{flight.to}</span></div></div>
                <div className="result-meta"><strong>{flight.number} · British Airways</strong><span>{airportName(flight.from)} → {airportName(flight.to)}</span><span>{callsignLabel(flight.number, flight.callsign, flight.referenceOnly)} · {flight.aircraft} · {flight.referenceOnly ? "2025–26 operational reference" : flight.scheduledForSelectedDate ? "Scheduled equipment" : "Checked flexible reference"}</span>{flight.continuesTo ? <span>Through service: continues to {airportName(flight.continuesTo)} ({flight.continuesTo}) on {flight.number}</span> : null}{flight.connectionSegment ? <span>Through-service connection sector</span> : null}</div>
                <div className="result-availability"><strong>{flight.slots > 0 ? "● Available" : "● Full"}</strong><span>{flight.slots} of {flight.capacity} pilot slots open</span></div>
                {pilotSession && pilot ? (
                  flight.slots > 0 && eligibleAircraft.length > 0 ? <form action={bookFlight}>
                    <input type="hidden" name="from" value={flight.from} /><input type="hidden" name="to" value={flight.to} /><input type="hidden" name="date" value={date} /><input type="hidden" name="flightNumber" value={flight.number} /><input type="hidden" name="routeId" value={flight.routeId} />{flexible ? <input type="hidden" name="flexible" value="1" /> : null}
                    <BookingAssignmentControls aircraft={eligibleAircraft} selectedAircraft={selectedAircraft} registrationOptions={registrationOptions} />
                    <button className="button button-primary" type="submit">Select flight</button>
                  </form> : flight.slots > 0 && eligibility && !eligibility.eligible ? <div className="pilot-qualification-lock"><button className="button button-primary" type="button" disabled>Qualification required</button><span>{eligibility.reason}</span></div> : <button className="button button-primary" type="button" disabled>Flight full</button>
                ) : <Link className="button button-primary" href="/login">Log in to book</Link>}
              </article>;
            }) : <div className="empty-state card"><h2>{invalidDurationRange ? "Choose a valid flight-time range" : hasDurationFilter ? "No verified flights in this range" : aircraft ? "No verified flights published for this airframe" : "No verified service published"}</h2><p>{invalidDurationRange ? "Set the first hour at or below the second hour, then apply the filter again." : hasDurationFilter ? "Try a wider range or clear the filter to see every checked service." : aircraft ? `Operations has not published a date-checked BA service using ${aircraft} for this date.` : `There is no date-checked BA flight with a confirmed operating callsign for ${hasCityPair ? `${airportName(from)} to ${airportName(to)}` : departureStation ?? "this search"} yet.`}</p><Link className="button button-primary" href={hasDurationFilter ? `/book?${clearDurationFilterParams.toString()}` : "/"}>{hasDurationFilter ? "Clear flight-time filter" : "Return to flight search"}</Link></div>}
          </div>
          <div className="integration-note"><strong>Operational accuracy:</strong> each selectable flight uses a real BA flight number, local planning time, aircraft and observed operating ICAO identifier. A 2025–26 operational reference is clearly labelled when the selected date has not been individually checked. An ICAO identifier is never generated from the BA flight number.</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
