"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const airports = [
  ["LHR", "London Heathrow"],
  ["LGW", "London Gatwick"],
  ["LCY", "London City"],
  ["OSL", "Oslo Gardermoen"],
  ["JFK", "New York JFK"],
  ["LAX", "Los Angeles"],
  ["PDX", "Portland, Oregon"],
  ["DXB", "Dubai"],
  ["SIN", "Singapore"],
  ["HND", "Tokyo Haneda"],
  ["CPT", "Cape Town"],
  ["SYD", "Sydney"],
] as const;

export function FlightSearch() {
  const router = useRouter();
  const [from, setFrom] = useState("LHR");
  const [to, setTo] = useState("OSL");
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [aircraft, setAircraft] = useState("Any aircraft");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams({ from, to, date, aircraft });
    router.push(`/book?${query.toString()}`);
  }

  return (
    <form className="flight-search" onSubmit={submit}>
      <div className="search-tabs" role="tablist" aria-label="Virtual flight tools">
        <button type="button" className="search-tab active">Book a virtual flight</button>
        <button type="button" className="search-tab">Manage assignment</button>
        <button type="button" className="search-tab">Flight status</button>
      </div>
      <div className="flight-search-body">
        <div className="field">
          <label htmlFor="from">From</label>
          <select id="from" value={from} onChange={(event) => setFrom(event.target.value)}>
            {airports.map(([code, city]) => <option key={code} value={code}>{city} ({code})</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="to">To</label>
          <select id="to" value={to} onChange={(event) => setTo(event.target.value)}>
            {airports.map(([code, city]) => <option key={code} value={code}>{city} ({code})</option>)}
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
            <option>Airbus A320neo</option>
            <option>Airbus A350-1000</option>
            <option>Boeing 777-200ER</option>
            <option>Boeing 777-300ER</option>
            <option>Boeing 787-9</option>
          </select>
        </div>
        <button className="button button-primary search-submit" type="submit">Find flights</button>
      </div>
      <div className="search-helper">
        <span><strong>Network database:</strong> full BA destination import is the next data milestone.</span>
        <span>Phoenix-ready assignment flow</span>
      </div>
    </form>
  );
}
