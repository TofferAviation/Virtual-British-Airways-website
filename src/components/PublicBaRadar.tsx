"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

const BaRadarMap = dynamic(() => import("@/components/BaRadarMap").then((module) => module.BaRadarMap), {
  ssr: false,
  loading: () => <div className="ba-radar-map-loading">Loading interactive map…</div>,
});

type Snapshot = {
  latitude: number;
  longitude: number;
  altitudeFt: number;
  groundSpeedKt: number;
  headingDeg: number;
  enginesRunning: boolean;
  onGround: boolean;
};

export type PublicRadarFlight = {
  id: string;
  flightNumber: string;
  from: string;
  to: string;
  aircraft: string;
  simulator: "xplane12" | "msfs2020" | "msfs2024";
  updatedAt: string;
  distanceNm: number;
  connectionHealthy: boolean;
  lastSnapshot: Snapshot | null;
  recentSnapshots: Snapshot[];
};

type FlightFilter = "all" | "airborne" | "ground";

const simulatorLabels: Record<PublicRadarFlight["simulator"], string> = {
  xplane12: "X-Plane 12",
  msfs2020: "MSFS 2020",
  msfs2024: "MSFS 2024",
};

function age(iso: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
}

function phase(snapshot: Snapshot | null) {
  if (!snapshot) return "Position pending";
  if (snapshot.onGround && snapshot.enginesRunning) return "Ground operations";
  if (snapshot.onGround) return "At stand";
  if (snapshot.altitudeFt < 10_000) return "Climb or descent";
  return "Cruise";
}

export function PublicBaRadar({ initialFlights }: { initialFlights: PublicRadarFlight[] }) {
  const [flights, setFlights] = useState(initialFlights);
  const [filter, setFilter] = useState<FlightFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialFlights.find((flight) => flight.lastSnapshot)?.id ?? initialFlights[0]?.id ?? "");
  const [checkedAt, setCheckedAt] = useState(new Date());

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/radar/live", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { flights?: PublicRadarFlight[] };
        if (mounted && Array.isArray(payload.flights)) {
          setFlights(payload.flights);
          setCheckedAt(new Date());
        }
      } catch {
        // Preserve the last verified public view if a refresh is interrupted.
      }
    };
    const interval = window.setInterval(refresh, 15_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, []);

  const visibleFlights = useMemo(() => flights.filter((flight) => {
    if (filter !== "all" && (!flight.lastSnapshot || (filter === "ground" ? !flight.lastSnapshot.onGround : flight.lastSnapshot.onGround))) return false;
    return `${flight.flightNumber} ${flight.from} ${flight.to} ${flight.aircraft}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [flights, filter, query]);

  useEffect(() => {
    if (!visibleFlights.some((flight) => flight.id === selectedId)) setSelectedId(visibleFlights[0]?.id ?? "");
  }, [visibleFlights, selectedId]);

  const selected = visibleFlights.find((flight) => flight.id === selectedId) ?? null;
  const positioned = visibleFlights.filter((flight) => flight.lastSnapshot);
  const airborne = flights.filter((flight) => flight.lastSnapshot && !flight.lastSnapshot.onGround).length;

  return <div className="ba-radar ba-radar-tracker">
    <header className="ba-radar-toolbar">
      <div className="ba-radar-brand"><span className="ba-radar-brand-mark">◉</span><div><strong>BA-Radar</strong><small>LIVE VIRTUAL FLIGHT TRACKER</small></div></div>
      <div className="ba-radar-toolbar-status"><i /><span>{flights.length} active</span><b>{airborne} airborne</b><em>Refreshed {checkedAt.toLocaleTimeString("en-GB")}</em></div>
      <label className="ba-radar-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search flights, routes or aircraft" aria-label="Search live flights" /></label>
    </header>
    <section className="ba-radar-stage" aria-label="BA-Radar live simulator map">
      <aside className="ba-radar-sidebar">
        <div className="ba-radar-selection-head"><span className="ba-radar-kicker">{selected ? "Selected live flight" : "Live flights"}</span><button type="button" onClick={() => setSelectedId("")} aria-label="Clear flight selection">×</button></div>
        {selected ? <div className="ba-radar-selected-flight"><div className="ba-radar-selected-title"><strong>{selected.flightNumber}</strong><span className={selected.connectionHealthy ? "ba-radar-connection connected" : "ba-radar-connection stale"}>{selected.connectionHealthy ? "Live" : "Delayed"}</span></div><p className="ba-radar-route"><b>{selected.from}</b><span>→</span><b>{selected.to}</b></p><p className="ba-radar-aircraft-name">{selected.aircraft}<br />{simulatorLabels[selected.simulator]}</p>{selected.lastSnapshot ? <div className="ba-radar-selected-data"><div><span>Altitude</span><strong>{Math.round(selected.lastSnapshot.altitudeFt).toLocaleString()} ft</strong></div><div><span>Speed</span><strong>{Math.round(selected.lastSnapshot.groundSpeedKt)} kt</strong></div><div><span>Track</span><strong>{Math.round(selected.lastSnapshot.headingDeg)}°</strong></div><div><span>Phase</span><strong>{phase(selected.lastSnapshot)}</strong></div></div> : <p className="ba-radar-pending">The first position report is pending.</p>}<p className="ba-radar-selected-foot">{Math.round(selected.distanceNm)} NM tracked · signal {age(selected.updatedAt)}</p></div> : <div className="ba-radar-zero-state"><strong>No active flight selected</strong><span>Choose an aircraft from the list or map when flights are online.</span></div>}
        <div className="ba-radar-list-controls"><span>Flight list</span><div>{(["all", "airborne", "ground"] as const).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "airborne" ? "Air" : "Ground"}</button>)}</div></div>
        <div className="ba-radar-flight-list">{visibleFlights.length ? visibleFlights.map((flight) => <button key={flight.id} type="button" onClick={() => setSelectedId(flight.id)} className={flight.id === selectedId ? "selected" : ""}><i className={flight.connectionHealthy ? "connected" : "stale"} /><span><strong>{flight.flightNumber}</strong><small>{flight.from} → {flight.to}</small></span><em>{flight.lastSnapshot ? `${Math.round(flight.lastSnapshot.altitudeFt).toLocaleString()} ft` : "Pending"}</em></button>) : <p className="ba-radar-none">No flights match this view.</p>}</div>
        <p className="ba-radar-sidebar-note">Simulator telemetry only. BA-Radar is not an air traffic control service.</p>
      </aside>
      <div className="ba-radar-map-wrap"><div className="ba-radar-map"><BaRadarMap flights={visibleFlights} selectedId={selectedId} onSelect={setSelectedId} /><div className="ba-radar-map-key"><span><i /> Connected</span><span><i className="stale" /> Delayed link</span></div>{!positioned.length && <div className="ba-radar-empty"><strong>Waiting for live flights</strong><span>Aircraft appear as soon as a pilot starts an active Cabin Control ACARS session.</span></div>}</div><footer className="ba-radar-map-footer"><span>{positioned.length} positions live</span><span>{airborne} airborne</span><span>OpenStreetMap · simulator world</span></footer></div>
    </section>
  </div>;
}
