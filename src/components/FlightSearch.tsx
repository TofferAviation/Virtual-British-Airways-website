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
    const query = new URLSearchParams({ from, to, date, aircraft });
    router.push(`/book?${query.toString()}`);
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
          <select id="from" value={from} onChange={(event) => setFrom(event.target.value)}>
            {orderedAirports.map((airport) => (
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
            <option>Airbus A319</option>
            <option>Airbus A320</option>
            <option>Airbus A320neo</option>
            <option>Airbus A321neo</option>
            <option>Airbus A350-1000</option>
            <option>Boeing 777-200ER</option>
            <option>Boeing 777-300ER</option>
            <option>Boeing 787-8</option>
            <option>Boeing 787-9</option>
            <option>Boeing 787-10</option>
            <option>Embraer E190</option>
          </select>
        </div>
        <button className="button button-primary search-submit" type="submit">Find flights</button>
      </div>
      <div className="search-helper">
        <span><strong>{airports.length + baseAirports.length} BA destinations / bases</strong> loaded into the current network selector.</span>
        <span>Phoenix-ready assignment flow</span>
      </div>
    </form>
  );
}
