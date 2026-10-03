"use client";

import Link from "next/link";
import { useState } from "react";
import type { FleetAircraftSummary } from "@/lib/fleet-service";

type Props = { aircraft: FleetAircraftSummary[] };

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hours(minutes: number) {
  return `${Math.floor(minutes / 60).toLocaleString("en-GB")}h`;
}

export function FleetOverviewClient({ aircraft }: Props) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [location, setLocation] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [livery, setLivery] = useState("all");
  const types = [...new Set(aircraft.map((item) => item.aircraftModel))].sort();
  const locations = [...new Set(aircraft.map((item) => item.currentStation).filter((item): item is string => Boolean(item)))].sort();
  const liveries = [...new Set(aircraft.map((item) => item.currentLivery).filter((item): item is string => Boolean(item)))].sort();
  const search = query.trim().toLowerCase();
  const visible = aircraft.filter((item) => {
    const isAvailable = item.operationalStatus === "available" && item.dispatchStatus !== "not_dispatchable";
    return (!search || [item.registration, item.aircraftModel, item.variant ?? "", item.currentStation ?? "", item.currentLivery ?? ""].join(" ").toLowerCase().includes(search))
      && (type === "all" || item.aircraftModel === type)
      && (status === "all" || item.technicalStatus === status)
      && (location === "all" || item.currentStation === location)
      && (availability === "all" || (availability === "available" ? isAvailable : !isAvailable))
      && (livery === "all" || item.currentLivery === livery);
  });

  return <section className="fleet-profile-overview" aria-labelledby="fleet-overview-title">
    <div className="fleet-profile-toolbar">
      <div><span className="fleet-profile-kicker">LIVE FLEET DIRECTORY</span><h2 id="fleet-overview-title">Explore individual airframes</h2><p>Every registration is connected to its live BAV operational record, not a copied list.</p></div>
      <label className="fleet-profile-search"><span className="fleet-visually-hidden">Search Fleet</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search registration or aircraft" /></label>
    </div>
    <div className="fleet-profile-filters" aria-label="Fleet filters">
      <select value={type} onChange={(event) => setType(event.target.value)}><option value="all">All aircraft types</option>{types.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All technical states</option>{[...new Set(aircraft.map((item) => item.technicalStatus))].sort().map((item) => <option key={item} value={item}>{label(item)}</option>)}</select>
      <select value={location} onChange={(event) => setLocation(event.target.value)}><option value="all">All locations</option>{locations.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <select value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="all">Any availability</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select>
      {liveries.length ? <select value={livery} onChange={(event) => setLivery(event.target.value)}><option value="all">All liveries</option>{liveries.map((item) => <option key={item} value={item}>{item}</option>)}</select> : null}
    </div>
    <p className="fleet-profile-result-count">{visible.length.toLocaleString("en-GB")} registration{visible.length === 1 ? "" : "s"} shown</p>
    <div className="fleet-profile-card-grid">
      {visible.map((item) => <Link key={item.id} href={`/fleet/${encodeURIComponent(item.registration)}`} className="fleet-profile-card">
        <div className="fleet-profile-card-image">{item.image ? <img src={item.image.url} alt={`${item.registration} ${item.aircraftModel}`} /> : <span aria-hidden="true">✈</span>}</div>
        <div className="fleet-profile-card-body"><div><span>{item.subfleet ?? "BAV FLEET"}</span><strong>{item.registration}</strong><p>{item.aircraftModel}{item.variant ? ` · ${item.variant}` : ""}</p></div><b className={`fleet-profile-status ${item.dispatchStatus === "not_dispatchable" ? "restricted" : ""}`}>{label(item.technicalStatus)}</b></div>
        <dl><div><dt>Location</dt><dd>{item.currentStation ?? "Not recorded"}</dd></div><div><dt>Operation</dt><dd>{label(item.operationalStatus)}</dd></div><div><dt>Fleet time</dt><dd>{hours(item.airframeHoursMinutes)}</dd></div></dl>
        {item.nextAssignedFlightReference ? <small>Next operation · {item.nextAssignedFlightReference}</small> : <small>Open aircraft profile →</small>}
      </Link>)}
    </div>
    {!visible.length ? <div className="fleet-profile-empty"><strong>No aircraft match those filters.</strong><span>Try clearing a filter or searching a different registration.</span></div> : null}
  </section>;
}
