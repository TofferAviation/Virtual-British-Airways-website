"use client";

import { useMemo, useState } from "react";
import type { FleetPublicFlight } from "@/lib/fleet-service";

type Props = { flights: FleetPublicFlight[] };

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function duration(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function AircraftRouteHistory({ flights }: Props) {
  const [range, setRange] = useState<7 | 14 | 30>(30);
  const visibleFlights = useMemo(() => flights.slice(0, range), [flights, range]);
  const destinations = useMemo(() => {
    const counts = new Map<string, number>();
    for (const flight of visibleFlights) {
      if (flight.arrivalStation) counts.set(flight.arrivalStation, (counts.get(flight.arrivalStation) ?? 0) + 1);
    }
    return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 8);
  }, [visibleFlights]);
  const routeStrip = useMemo(() => visibleFlights.slice().reverse().flatMap((flight, index) => index === 0 ? [flight.departureStation, flight.arrivalStation] : [flight.arrivalStation]).filter((station): station is string => Boolean(station)), [visibleFlights]);

  return <section className="fleet-aircraft-panel fleet-aircraft-panel-wide">
    <div className="fleet-aircraft-panel-heading fleet-aircraft-route-heading"><div><span className="fleet-profile-kicker">RECENT BAV OPERATIONS</span><h2>Route history</h2></div><div className="fleet-aircraft-range" aria-label="Route history range">{([7, 14, 30] as const).map((value) => <button key={value} type="button" onClick={() => setRange(value)} aria-pressed={range === value}>{value}</button>)}</div></div>
    {visibleFlights.length ? <>
      <p className="fleet-aircraft-route-strip" aria-label="Recent route strip">{routeStrip.join(" → ")}</p>
      <div className="fleet-aircraft-destinations"><strong>Recent destinations</strong><div>{destinations.map(([station, count]) => <span key={station}>{station} <b>{count}</b></span>)}</div></div>
      <div className="fleet-aircraft-flight-list">{visibleFlights.map((flight) => <article key={flight.id}><time>{formatDate(flight.onBlockAt ?? flight.offBlockAt)}</time><strong>{flight.flightReference}</strong><span>{flight.departureStation ?? "—"} → {flight.arrivalStation ?? "—"}</span><span>{duration(flight.blockMinutes)}</span><small>{flight.pilotName ?? "Pilot identity unavailable"}</small></article>)}</div>
    </> : <p className="fleet-aircraft-clear">No BAV flights have been recorded for this aircraft yet.</p>}
  </section>;
}
