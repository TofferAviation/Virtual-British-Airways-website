"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { airports } from "@/data/airports";

const baseAirports = [
  { code: "LHR", name: "London Heathrow", country: "United Kingdom" },
  { code: "LGW", name: "London Gatwick", country: "United Kingdom" },
  { code: "LCY", name: "London City", country: "United Kingdom" },
];

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

export function FlightSearch() {
  const router = useRouter();
  const [from, setFrom] = useState("LHR");
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
    if (aircraft !== "Any aircraft") {
      router.push(`/book?${new URLSearchParams({ aircraft, date }).toString()}`);
      return;
    }
    router.push(`/book?${new URLSearchParams({ from, to, date }).toString()}`);
  }

  return (
    <form className="flight-search" onSubmit={submit} id="flight-search">
      <div className="search-tabs" role="tablist" aria-label="Virtual flight tools">
        <button type="button" className="search-tab active">Book a virtual flight</button>
        <button type="button" className="search-tab">Manage assignment</button>
        <button type="button" className="search-tab">Flight status</button>
      </div>
      <div className="flight-search-body">
        <div className="field">
          <label htmlFor="from">From</label>
          <select id="from" value={from} onChange={(event) => setFrom(event.target.value)} disabled={aircraft !== "Any aircraft"}>
            {orderedAirports.map((airport) => (
              <option key={`from-${airport.code}`} value={airport.code}>
                {airport.name} ({airport.code}) — {airport.country}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <select id="to" value={to} onChange={(event) => setTo(event.target.value)} disabled={aircraft !== "Any aircraft"}>
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
        <span>{aircraft === "Any aircraft" ? "Search a city pair or select an airframe to see its current routes" : `${aircraft} · showing routes operated by this airframe`}</span>
      </div>
    </form>
  );
}
