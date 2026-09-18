"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { RADAR_WIND_LAYERS, type RadarWeatherData, type RadarWindLayerId, type VatsimRadarData, type VatsimStation } from "@/lib/radar-external";

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

export type RadarLayers = {
  vatsim: boolean;
  precipitation: boolean;
  winds: boolean;
  convection: boolean;
  advisories: boolean;
};

const layerLabels: Array<{ key: keyof RadarLayers; label: string; detail: string }> = [
  { key: "vatsim", label: "VATSIM ATC", detail: "Live controller and ATIS positions" },
  { key: "precipitation", label: "Precipitation", detail: "Latest available weather radar" },
  { key: "winds", label: "Animated wind", detail: "Animated model wind at the selected altitude" },
  { key: "convection", label: "Convective outlook", detail: "Modelled atmospheric instability — not live lightning observations" },
  { key: "advisories", label: "Aviation hazards", detail: "SIGMET advisories, including turbulence where issued" },
];

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

function controllerAge(controller: VatsimStation) {
  return controller.onlineSince ? age(controller.onlineSince) : "Time unavailable";
}

export function PublicBaRadar({ initialFlights }: { initialFlights: PublicRadarFlight[] }) {
  const [flights, setFlights] = useState(initialFlights);
  const [filter, setFilter] = useState<FlightFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialFlights.find((flight) => flight.lastSnapshot)?.id ?? initialFlights[0]?.id ?? "");
  const [checkedAt, setCheckedAt] = useState(() => new Date(0));
  const [layers, setLayers] = useState<RadarLayers>({ vatsim: true, precipitation: false, winds: false, convection: false, advisories: false });
  const [windLayer, setWindLayer] = useState<RadarWindLayerId>("surface");
  const [vatsim, setVatsim] = useState<VatsimRadarData | null>(null);
  const [weather, setWeather] = useState<RadarWeatherData | null>(null);
  const [selectedController, setSelectedController] = useState("");

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
    void refresh();
    const interval = window.setInterval(refresh, 15_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!layers.vatsim) return;
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/radar/vatsim", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as VatsimRadarData;
        if (mounted) setVatsim(payload);
      } catch {
        // BA-Radar remains useful if VATSIM's public feed is temporarily unavailable.
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 15_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [layers.vatsim]);

  const needsWeather = layers.precipitation || layers.winds || layers.convection || layers.advisories;
  useEffect(() => {
    if (!needsWeather) return;
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/radar/weather?windLayer=${encodeURIComponent(windLayer)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as RadarWeatherData;
        if (mounted) setWeather(payload);
      } catch {
        // Each layer degrades quietly instead of interrupting simulator tracking.
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 5 * 60_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [needsWeather, windLayer]);

  const visibleFlights = useMemo(() => flights.filter((flight) => {
    if (filter !== "all" && (!flight.lastSnapshot || (filter === "ground" ? !flight.lastSnapshot.onGround : flight.lastSnapshot.onGround))) return false;
    return `${flight.flightNumber} ${flight.from} ${flight.to} ${flight.aircraft}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [flights, filter, query]);

  const selected = visibleFlights.find((flight) => flight.id === selectedId) ?? visibleFlights[0] ?? null;
  const controller = vatsim?.controllers.find((entry) => entry.callsign === selectedController) ?? null;
  const positioned = visibleFlights.filter((flight) => flight.lastSnapshot);
  const airborne = flights.filter((flight) => flight.lastSnapshot && !flight.lastSnapshot.onGround).length;
  const selectFlight = (id: string) => { setSelectedController(""); setSelectedId(id); };
  const selectController = (callsign: string) => { setSelectedId(""); setSelectedController(callsign); };
  const toggleLayer = (key: keyof RadarLayers) => setLayers((current) => ({ ...current, [key]: !current[key] }));
  const hasExternalMapData = layers.vatsim || needsWeather;

  return <div className="ba-radar ba-radar-tracker">
    <header className="ba-radar-toolbar">
      <div className="ba-radar-brand"><Image className="ba-radar-brand-mark" src="/branding/ba-radar-icon.png" width={40} height={40} alt="BA-Radar" priority /><div><strong>BA-Radar</strong><small>LIVE VIRTUAL FLIGHT TRACKER</small></div></div>
      <div className="ba-radar-toolbar-status"><i /><span>{flights.length} active</span><b>{airborne} airborne</b>{layers.vatsim ? <span>{vatsim?.onlineCount ?? 0} VATSIM ATC</span> : null}<em>Refreshed {checkedAt.toLocaleTimeString("en-GB")}</em></div>
      <label className="ba-radar-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search flights, routes or aircraft" aria-label="Search live flights" /></label>
    </header>
    <section className="ba-radar-stage" aria-label="BA-Radar live simulator map">
      <aside className="ba-radar-sidebar">
        <div className="ba-radar-selection-head"><span className="ba-radar-kicker">{controller ? "Selected VATSIM position" : selected ? "Selected live flight" : "Live flights"}</span><button type="button" onClick={() => { setSelectedId(""); setSelectedController(""); }} aria-label="Clear map selection">×</button></div>
        {controller ? <div className="ba-radar-selected-flight ba-radar-controller-detail"><div className="ba-radar-selected-title"><strong>{controller.callsign}</strong><span className="ba-radar-connection connected">{controller.kind === "atis" ? "ATIS" : "VATSIM ATC"}</span></div><p className="ba-radar-route">{controller.frequency}</p><p className="ba-radar-aircraft-name">{controller.facilityName}<br />{controller.facility} position</p><div className="ba-radar-selected-data"><div><span>Coverage</span><strong>{controller.visualRangeNm === null ? "Not published" : `${controller.visualRangeNm} NM`}</strong></div><div><span>Online</span><strong>{controllerAge(controller)}</strong></div></div>{controller.atis.length ? <div className="ba-radar-controller-atis"><span>Controller information</span><p>{controller.atis.slice(0, 3).join(" · ")}</p></div> : null}<p className="ba-radar-selected-foot">Live VATSIM network data. Verify active frequencies in your pilot client before use.</p></div> : selected ? <div className="ba-radar-selected-flight"><div className="ba-radar-selected-title"><strong>{selected.flightNumber}</strong><span className={selected.connectionHealthy ? "ba-radar-connection connected" : "ba-radar-connection stale"}>{selected.connectionHealthy ? "Live" : "Delayed"}</span></div><p className="ba-radar-route"><b>{selected.from}</b><span>→</span><b>{selected.to}</b></p><p className="ba-radar-aircraft-name">{selected.aircraft}<br />{simulatorLabels[selected.simulator]}</p>{selected.lastSnapshot ? <div className="ba-radar-selected-data"><div><span>Altitude</span><strong>{Math.round(selected.lastSnapshot.altitudeFt).toLocaleString()} ft</strong></div><div><span>Speed</span><strong>{Math.round(selected.lastSnapshot.groundSpeedKt)} kt</strong></div><div><span>Track</span><strong>{Math.round(selected.lastSnapshot.headingDeg)}°</strong></div><div><span>Phase</span><strong>{phase(selected.lastSnapshot)}</strong></div></div> : <p className="ba-radar-pending">The first position report is pending.</p>}<p className="ba-radar-selected-foot">{Math.round(selected.distanceNm)} NM tracked · signal {age(selected.updatedAt)}</p></div> : <div className="ba-radar-zero-state"><strong>No active flight selected</strong><span>Choose a BAV aircraft or VATSIM controller from the map.</span></div>}
        <div className="ba-radar-list-controls"><span>Flight list</span><div>{(["all", "airborne", "ground"] as const).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "airborne" ? "Air" : "Ground"}</button>)}</div></div>
        <div className="ba-radar-flight-list">{visibleFlights.length ? visibleFlights.map((flight) => <button key={flight.id} type="button" onClick={() => selectFlight(flight.id)} className={flight.id === selected?.id && !controller ? "selected" : ""}><i className={flight.connectionHealthy ? "connected" : "stale"} /><span><strong>{flight.flightNumber}</strong><small>{flight.from} → {flight.to}</small></span><em>{flight.lastSnapshot ? `${Math.round(flight.lastSnapshot.altitudeFt).toLocaleString()} ft` : "Pending"}</em></button>) : <p className="ba-radar-none">No flights match this view.</p>}</div>
        <div className="ba-radar-vatsim-summary"><strong>VATSIM network</strong><span>{layers.vatsim ? vatsim?.available === false ? "Live feed unavailable — BAV tracking remains online." : `${vatsim?.onlineCount ?? 0} controllers currently online` : "ATC layer is switched off."}</span></div>
        <p className="ba-radar-sidebar-note">BA-Radar is a read-only flight-simulation map, not an air traffic control service. Confirm all operational instructions in your pilot client.</p>
      </aside>
      <div className="ba-radar-map-wrap">
        <div className="ba-radar-map">
          <BaRadarMap flights={visibleFlights} selectedId={selected?.id ?? ""} onSelect={selectFlight} controllers={vatsim?.controllers ?? []} weather={weather} layers={layers} selectedController={selectedController} onSelectController={selectController} />
          <div className="ba-radar-layer-controls" role="group" aria-label="BA-Radar map layers">
            <strong>Map layers</strong>
            {layerLabels.map((layer) => <button key={layer.key} type="button" className={layers[layer.key] ? "active" : ""} onClick={() => toggleLayer(layer.key)} aria-pressed={layers[layer.key]} title={layer.detail}>{layer.label}</button>)}
            {layers.winds ? <label className="ba-radar-layer-select"><span>Wind altitude</span><select value={windLayer} onChange={(event) => setWindLayer(event.target.value as RadarWindLayerId)}>{RADAR_WIND_LAYERS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select><small>{RADAR_WIND_LAYERS.find((entry) => entry.id === windLayer)?.sourceLabel}</small></label> : null}
            {layers.convection ? <p className="ba-radar-layer-note">Modelled instability only — actual lightning needs a dedicated strike-data provider.</p> : null}
          </div>
          <div className="ba-radar-map-key"><span><i /> BAV connected</span><span><i className="stale" /> Delayed link</span>{layers.vatsim ? <span><i className="vatsim" /> VATSIM ATC</span> : null}</div>
          {!positioned.length && !hasExternalMapData ? <div className="ba-radar-empty"><strong>Waiting for live flights</strong><span>Aircraft appear as soon as a pilot starts an active Ember ACARS session.</span></div> : null}
        </div>
        <footer className="ba-radar-map-footer"><span>{positioned.length} BAV positions live</span><span>{airborne} BAV airborne</span><span>{layers.vatsim ? "VATSIM Data" : "BAV telemetry"}{needsWeather ? " · Weather layers active" : ""}</span></footer>
      </div>
    </section>
  </div>;
}
