"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { airports } from "@/data/airports";
import { BAV_NETWORK_ROUTE_COUNTS } from "@/data/bav-network-2026";
import { BAV_HUBS, type BavHubCode } from "@/lib/hubs";

const baseAirports = BAV_HUBS.map((hub) => ({ ...hub, country: "United Kingdom" }));

const preferredAirportCodes = ["LHR", "LGW", "LCY", "OSL", "JFK", "LAX", "DXB", "SIN"];

const aircraftTypes = [
  "Airbus A319",
  "Airbus A320",
  "Airbus A320neo",
  "Airbus A321neo",
  "Airbus A350-1000",
  "Boeing 777-200ER",
  "Boeing 777-300ER",
  "Boeing 787-8",
  "Boeing 787-9",
  "Boeing 787-10",
  "Embraer E190",
];

type AirportChoice = (typeof airports)[number] | (typeof baseAirports)[number];

function airportOptionLabel(airport: AirportChoice) {
  return `${airport.name} (${airport.code}) — ${airport.country}`;
}

function airportCodeFromSearch(value: string, choices: AirportChoice[]) {
  const query = value.trim();
  if (!query) return null;

  const code = /^([A-Za-z0-9]{3})$/.exec(query)?.[1]?.toUpperCase()
    ?? /\(([A-Za-z0-9]{3})\)/.exec(query)?.[1]?.toUpperCase();
  if (code && choices.some((airport) => airport.code === code)) return code;

  const normalisedQuery = query.toLocaleLowerCase();
  return choices.find((airport) => airportOptionLabel(airport).toLocaleLowerCase() === normalisedQuery)?.code ?? null;
}

export function FlightSearch({ initialHub = "LHR" }: { initialHub?: BavHubCode }) {
  const router = useRouter();
  const [from, setFrom] = useState<BavHubCode>(initialHub);
  const [fromSearch, setFromSearch] = useState(() => airportOptionLabel(baseAirports.find((airport) => airport.code === initialHub) ?? baseAirports[0]));
  const [toSearch, setToSearch] = useState(() => airportOptionLabel(airports.find((airport) => airport.code === "OSL") ?? airports[0]));
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [aircraft, setAircraft] = useState("Any aircraft");
  const [airportSearchError, setAirportSearchError] = useState<string | null>(null);

  const orderedAirports = useMemo(() => {
    const merged = [
      ...baseAirports,
      ...airports.filter((airport) => !baseAirports.some((base) => base.code === airport.code)),
    ];
    const preferred = preferredAirportCodes
      .map((code) => merged.find((airport) => airport.code === code))
      .filter((airport): airport is (typeof merged)[number] => Boolean(airport));
    const remaining = merged.filter((airport) => !preferredAirportCodes.includes(airport.code));
    return [...preferred, ...remaining];
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const departure = airportCodeFromSearch(fromSearch, baseAirports);
    const arrival = airportCodeFromSearch(toSearch, orderedAirports);
    if (!departure || !arrival) {
      setAirportSearchError("Choose an airport from the search suggestions, or enter its three-letter airport code.");
      return;
    }
    if (departure === arrival) {
      setAirportSearchError("Choose different departure and arrival airports.");
      return;
    }
    setAirportSearchError(null);
    setFrom(departure as BavHubCode);
    const params = new URLSearchParams({ from: departure, to: arrival, date });
    if (aircraft !== "Any aircraft") params.set("aircraft", aircraft);
    router.push(`/book?${params.toString()}`);
  }

  return (
    <form className="flight-search" onSubmit={submit} id="flight-search">
      <div className="search-tabs" role="tablist" aria-label="Virtual flight tools">
        <button type="button" className="search-tab active">Book a virtual flight</button>
        <button type="button" className="search-tab" onClick={() => router.push("/manage-assignment")}>Manage assignment</button>
        <button type="button" className="search-tab" onClick={() => router.push("/flight-status")}>Flight status</button>
      </div>
      <div className="flight-search-body">
        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" type="search" list="bav-departure-airports" value={fromSearch} placeholder="Search departure airport" autoComplete="off" onChange={(event) => {
            const value = event.target.value;
            setFromSearch(value);
            const code = airportCodeFromSearch(value, baseAirports);
            if (code) setFrom(code as BavHubCode);
            setAirportSearchError(null);
          }} aria-describedby="airport-search-help" />
          <datalist id="bav-departure-airports">
            {baseAirports.map((airport) => (
              <option key={`from-${airport.code}`} value={airportOptionLabel(airport)} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" type="search" list="bav-destination-airports" value={toSearch} placeholder="Search destination or airport code" autoComplete="off" onChange={(event) => {
            const value = event.target.value;
            setToSearch(value);
            setAirportSearchError(null);
          }} aria-describedby="airport-search-help" />
          <datalist id="bav-destination-airports">
            {orderedAirports.map((airport) => (
              <option key={`to-${airport.code}`} value={airportOptionLabel(airport)} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="date">Departure</label>
          <input id="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="aircraft">Aircraft</label>
          <select id="aircraft" value={aircraft} onChange={(event) => setAircraft(event.target.value)}>
            <option>Any aircraft</option>
            {aircraftTypes.map((type) => <option key={type}>{type}</option>)}
          </select>
        </div>
        <button className="button button-primary search-submit" type="submit">Find flights</button>
      </div>
      <div id="airport-search-help" className="airport-search-help" aria-live="polite">
        {airportSearchError ?? "Search by city, airport name or three-letter airport code, then choose a suggested airport."}
      </div>
      <div className="search-helper">
        <span><strong>{BAV_NETWORK_ROUTE_COUNTS.total} BA London-hub airport-pair routes</strong> loaded: {BAV_NETWORK_ROUTE_COUNTS.LHR} Heathrow, {BAV_NETWORK_ROUTE_COUNTS.LGW} Gatwick and {BAV_NETWORK_ROUTE_COUNTS.LCY} City.</span>
        {aircraft === "Any aircraft" ? <button type="button" className="hub-search-link" onClick={() => router.push(`/book?${new URLSearchParams({ hub: from, date }).toString()}`)}>Browse every BAV service from {from} →</button> : <span>{aircraft} · filter this city pair by the aircraft scheduled for that service</span>}
      </div>
    </form>
  );
}
