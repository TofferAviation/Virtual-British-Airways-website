"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { airports } from "@/data/airports";
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

export function FlightSearch({ initialHub = "LHR" }: { initialHub?: BavHubCode }) {
  const router = useRouter();
  const [from, setFrom] = useState<BavHubCode>(initialHub);
  const [to, setTo] = useState("OSL");
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [aircraft, setAircraft] = useState("Any aircraft");

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
    const params = new URLSearchParams({ from, to, date });
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
          <select id="from" value={from} onChange={(event) => setFrom(event.target.value as BavHubCode)}>
            {baseAirports.map((airport) => (
              <option key={`from-${airport.code}`} value={airport.code}>
                {airport.name} ({airport.code}) — {airport.country}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <select id="to" value={to} onChange={(event) => setTo(event.target.value)}>
            {orderedAirports.map((airport) => (
              <option key={`to-${airport.code}`} value={airport.code}>
                {airport.name} ({airport.code}) — {airport.country}
              </option>
            ))}
          </select>
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
      <div className="search-helper">
        <span><strong>{airports.length + baseAirports.length} BA destinations / bases</strong> loaded into the current network selector.</span>
        {aircraft === "Any aircraft" ? <button type="button" className="hub-search-link" onClick={() => router.push(`/book?${new URLSearchParams({ hub: from, date }).toString()}`)}>Browse every BAV service from {from} →</button> : <span>{aircraft} · filter this city pair by the aircraft scheduled for that service</span>}
      </div>
    </form>
  );
}
