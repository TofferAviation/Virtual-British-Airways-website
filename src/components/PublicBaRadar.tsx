"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { RADAR_WIND_LAYERS, type RadarWeatherData, type RadarWindGrid, type RadarWindLayerId, type VatsimRadarData, type VatsimStation } from "@/lib/radar-external";
import type { PublicRadarFlight, PublicRadarSnapshot } from "@/lib/radar-live";

const BaRadarMap = dynamic(() => import("@/components/BaRadarMap").then((module) => module.BaRadarMap), {
  ssr: false,
  loading: () => <div className="ba-radar-map-loading">Loading interactive map…</div>,
});

type FlightFilter = "all" | "airborne" | "ground";

export type RadarLayers = {
  vatsim: boolean;
  precipitation: boolean;
  winds: boolean;
  lightning: boolean;
  advisories: boolean;
};

const layerLabels: Array<{ key: keyof RadarLayers; label: string; detail: string }> = [
  { key: "vatsim", label: "VATSIM ATC", detail: "Live controller and ATIS positions" },
  { key: "precipitation", label: "Precipitation", detail: "Latest available weather radar" },
  { key: "winds", label: "GFS wind flow", detail: "GPU-rendered NOAA GFS wind at the selected altitude" },
  { key: "lightning", label: "Observed lightning", detail: "EUMETSAT Lightning Imager flash coverage where available" },
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

function phase(snapshot: PublicRadarSnapshot | null) {
  if (!snapshot) return "Position pending";
  if (snapshot.onGround && snapshot.enginesRunning) return "Ground operations";
  if (snapshot.onGround) return "At stand";
  if (snapshot.altitudeFt < 10_000) return "Climb or descent";
  return "Cruise";
}

function controllerAge(controller: VatsimStation) {
  return controller.onlineSince ? age(controller.onlineSince) : "Time unavailable";
}

function telemetryTime(iso: string) {
  const time = new Date(iso);
  return Number.isNaN(time.getTime()) ? "Time unavailable" : new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" }).format(time) + " UTC";
}

function position(value: number, positive: string, negative: string) {
  return `${Math.abs(value).toFixed(4)}°${value >= 0 ? positive : negative}`;
}

function historyLine(snapshots: PublicRadarSnapshot[], valueFor: (snapshot: PublicRadarSnapshot) => number | null) {
  const values = snapshots.map(valueFor);
  const usable = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (usable.length < 2) return null;
  const minimum = Math.min(...usable);
  const span = Math.max(1, Math.max(...usable) - minimum);
  const last = Math.max(1, snapshots.length - 1);
  return snapshots.map((snapshot, index) => {
    const value = valueFor(snapshot);
    if (value == null || !Number.isFinite(value)) return null;
    return `${(index / last * 250 + 5).toFixed(1)},${(64 - ((value - minimum) / span * 52 + 6)).toFixed(1)}`;
  }).filter((point): point is string => point !== null).join(" ");
}

function TelemetryHistory({ flight, snapshot }: { flight: PublicRadarFlight; snapshot: PublicRadarSnapshot }) {
  const snapshots = [...flight.recentSnapshots, snapshot]
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.timestamp === entry.timestamp) === index)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const altitude = historyLine(snapshots, (entry) => entry.altitudeFt);
  const speed = historyLine(snapshots, (entry) => entry.groundSpeedKt);
  if (!altitude && !speed) return <p className="ba-radar-telemetry-empty">History will appear after Ember has collected a few simulator samples.</p>;
  return <>
    <div className="ba-radar-telemetry-legend"><span><i className="altitude" /> Altitude</span><span><i className="speed" /> Ground speed</span></div>
    <svg className="ba-radar-telemetry-chart" viewBox="0 0 260 70" role="img" aria-label="Recent simulator altitude and ground-speed history">
      <path className="ba-radar-telemetry-grid" d="M5 12H255M5 35H255M5 58H255" />
      {altitude ? <polyline className="ba-radar-telemetry-altitude" points={altitude} /> : null}
      {speed ? <polyline className="ba-radar-telemetry-speed" points={speed} /> : null}
    </svg>
    <p className="ba-radar-telemetry-chart-note">Recent values sent by the simulator. The two lines use independent scales.</p>
  </>;
}

function TrackerSection({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return <details className="ba-radar-tracker-section" open={open}>
    <summary><span>{title}</span><b aria-hidden="true">⌄</b></summary>
    <div className="ba-radar-tracker-section-body">{children}</div>
  </details>;
}

function FlightTrackerDetails({ flight }: { flight: PublicRadarFlight }) {
  const snapshot = flight.lastSnapshot;
  return <div className="ba-radar-selected-flight ba-radar-flight-tracker-detail">
    <header className="ba-radar-tracker-flight-head">
      <div><span>BA-RADAR LIVE FLIGHT</span><strong>{flight.callsign}</strong><small>Flight number {flight.flightNumber}</small></div>
      <i className={flight.connectionHealthy ? "ba-radar-connection connected" : "ba-radar-connection stale"}>{flight.connectionHealthy ? "Live" : "Delayed"}</i>
    </header>
    {flight.aircraftImage ? <a className="ba-radar-tracker-photo" href={flight.aircraftImage.sourcePageUrl ?? flight.aircraftImage.url} target="_blank" rel="noreferrer" title={`View photo source: ${flight.aircraftImage.source}`}><img src={flight.aircraftImage.url} alt={`${flight.registration ?? flight.aircraft} aircraft`} /><span>Photo · {flight.aircraftImage.source}</span></a> : <div className="ba-radar-tracker-photo ba-radar-tracker-photo-empty" aria-hidden="true">✈</div>}
    <div className="ba-radar-tracker-route">
      <div><span>Departure</span><strong>{flight.from}</strong></div><b aria-hidden="true">✈</b><div><span>{flight.diversionAirport ? "Planned arrival" : "Arrival"}</span><strong>{flight.to}</strong></div>
    </div>
    {flight.diversionAirport ? <div className="ba-radar-diversion-notice"><strong>DIVERTING</strong><span>Ember reports {flight.diversionAirport} as the diversion airport.</span></div> : null}
    {snapshot ? <>
      <TrackerSection title="Route trace">
        {flight.plannedRoute ? <p className="ba-radar-route-trace"><strong>{flight.plannedRoute.source === "simbrief" ? "SimBrief planned route" : "Direct airport route"}</strong><span>{flight.plannedRoute.points.length.toLocaleString()} plotted route points. The dashed blue line is the planned route; the solid gold line is the aircraft's recorded track.</span></p> : <p className="ba-radar-route-trace"><strong>Planned route pending</strong><span>Sync the SimBrief OFP for this assignment to show its planned route on BA-Radar. The recorded track remains available.</span></p>}
      </TrackerSection>
      <TrackerSection title="Aircraft">
        <div className="ba-radar-tracker-aircraft"><div><span>Registration</span><strong>{flight.registration ?? "Pending"}</strong></div><div><span>Aircraft type</span><strong>{flight.aircraft}</strong></div><div><span>Simulator</span><strong>{simulatorLabels[flight.simulator]}</strong></div></div>
      </TrackerSection>
      <TrackerSection title="Live flight data" open>
        <div className="ba-radar-selected-data ba-radar-flight-data">
          <div><span>Altitude</span><strong>{Math.round(snapshot.altitudeFt).toLocaleString()} ft</strong></div>
          <div><span>Vertical speed</span><strong>{snapshot.verticalSpeedFpm == null ? "—" : `${Math.round(snapshot.verticalSpeedFpm).toLocaleString()} fpm`}</strong></div>
          <div><span>Ground speed</span><strong>{Math.round(snapshot.groundSpeedKt)} kt</strong></div>
          <div><span>Indicated airspeed</span><strong>{snapshot.indicatedAirspeedKt == null ? "—" : `${Math.round(snapshot.indicatedAirspeedKt)} kt`}</strong></div>
          <div><span>Heading</span><strong>{Math.round(snapshot.headingDeg)}°</strong></div>
          <div><span>Squawk</span><strong>{snapshot.squawk ?? "—"}</strong></div>
          <div><span>Beacon</span><strong>{snapshot.beaconOn ? "On" : "Off"}</strong></div>
          <div><span>Flight phase</span><strong>{phase(snapshot)}</strong></div>
        </div>
      </TrackerSection>
      <TrackerSection title="Position & signal">
        <div className="ba-radar-tracker-aircraft"><div><span>Latitude</span><strong>{position(snapshot.latitude, "N", "S")}</strong></div><div><span>Longitude</span><strong>{position(snapshot.longitude, "E", "W")}</strong></div><div><span>Last simulator sample</span><strong>{telemetryTime(snapshot.timestamp)}</strong></div><div><span>Tracked distance</span><strong>{Math.round(flight.distanceNm)} NM</strong></div></div>
      </TrackerSection>
      <TrackerSection title="Speed & altitude history">
        <TelemetryHistory flight={flight} snapshot={snapshot} />
      </TrackerSection>
    </> : <p className="ba-radar-pending">The first position report is pending.</p>}
  </div>;
}

export function PublicBaRadar({ initialFlights }: { initialFlights: PublicRadarFlight[] }) {
  const [flights, setFlights] = useState(initialFlights);
  const [filter, setFilter] = useState<FlightFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(initialFlights.find((flight) => flight.lastSnapshot)?.id ?? initialFlights[0]?.id ?? "");
  const [checkedAt, setCheckedAt] = useState(() => new Date(0));
  const [layers, setLayers] = useState<RadarLayers>({ vatsim: true, precipitation: false, winds: false, lightning: false, advisories: false });
  const [windLayer, setWindLayer] = useState<RadarWindLayerId>("surface");
  const [vatsim, setVatsim] = useState<VatsimRadarData | null>(null);
  const [weather, setWeather] = useState<RadarWeatherData | null>(null);
  const [windGrid, setWindGrid] = useState<RadarWindGrid | null>(null);
  const [windError, setWindError] = useState("");
  const [windRendererStatus, setWindRendererStatus] = useState<"loading" | "ready" | "unsupported">("loading");
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
    const interval = window.setInterval(refresh, 5_000);
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

  const needsWeather = layers.precipitation || layers.advisories;
  useEffect(() => {
    if (!needsWeather) return;
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/radar/weather", { cache: "no-store" });
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
  }, [needsWeather]);

  useEffect(() => {
    if (!layers.winds) return;
    let mounted = true;
    const refresh = async () => {
      try {
        if (mounted) {
          setWindGrid(null);
          setWindRendererStatus("loading");
        }
        setWindError("");
        const response = await fetch(`/api/radar/wind-grid?windLayer=${encodeURIComponent(windLayer)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("The GFS field is currently unavailable.");
        const payload = await response.json() as RadarWindGrid;
        if (mounted) setWindGrid(payload);
      } catch {
        if (mounted) {
          setWindGrid(null);
          setWindError("NOAA GFS is temporarily unavailable. Try the layer again shortly.");
        }
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 20 * 60_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [layers.winds, windLayer]);

  const visibleFlights = useMemo(() => flights.filter((flight) => {
    if (filter !== "all" && (!flight.lastSnapshot || (filter === "ground" ? !flight.lastSnapshot.onGround : flight.lastSnapshot.onGround))) return false;
    return `${flight.flightNumber} ${flight.callsign} ${flight.from} ${flight.to} ${flight.aircraft}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [flights, filter, query]);

  // A cleared selection must remain clear. Falling back to the first visible
  // flight made the tracker appear locked after pilots pressed the close
  // control or clicked their selected aircraft a second time.
  const selected = selectedId ? visibleFlights.find((flight) => flight.id === selectedId) ?? null : null;
  const controller = vatsim?.controllers.find((entry) => entry.callsign === selectedController) ?? null;
  const positioned = visibleFlights.filter((flight) => flight.lastSnapshot);
  const airborne = flights.filter((flight) => flight.lastSnapshot && !flight.lastSnapshot.onGround).length;
  const clearSelection = () => { setSelectedId(""); setSelectedController(""); };
  const selectFlight = (id: string) => {
    setSelectedController("");
    setSelectedId((current) => current === id ? "" : id);
  };
  const selectController = (callsign: string) => {
    setSelectedId("");
    setSelectedController((current) => current === callsign ? "" : callsign);
  };
  const toggleLayer = (key: keyof RadarLayers) => setLayers((current) => ({ ...current, [key]: !current[key] }));
  const activeLayerCount = layerLabels.filter((layer) => layers[layer.key]).length;
  const hasExternalMapData = layers.vatsim || needsWeather || layers.winds || layers.lightning;

  return <div className="ba-radar ba-radar-tracker">
    <header className="ba-radar-toolbar">
      <div className="ba-radar-brand"><Image className="ba-radar-brand-mark" src="/branding/ba-radar-icon.png" width={40} height={40} alt="BA-Radar" priority /><div><strong>BA-Radar</strong><small>LIVE VIRTUAL FLIGHT TRACKER</small></div></div>
      <div className="ba-radar-toolbar-status"><i /><span>{flights.length} active</span><b>{airborne} airborne</b>{layers.vatsim ? <span>{vatsim?.onlineCount ?? 0} VATSIM ATC</span> : null}<em>Refreshed {checkedAt.toLocaleTimeString("en-GB")}</em></div>
      <label className="ba-radar-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search flights, routes or aircraft" aria-label="Search live flights" /></label>
    </header>
    <section className="ba-radar-stage" aria-label="BA-Radar live simulator map">
      <aside className="ba-radar-sidebar">
        <div className="ba-radar-selection-head"><span className="ba-radar-kicker">{controller ? "Selected VATSIM position" : selected ? "Selected live flight" : "Live flights"}</span>{selected || controller ? <button type="button" onClick={clearSelection} aria-label="Clear map selection">Clear <b aria-hidden="true">×</b></button> : null}</div>
        {controller ? <div className="ba-radar-selected-flight ba-radar-controller-detail"><div className="ba-radar-selected-title"><strong>{controller.callsign}</strong><span className="ba-radar-connection connected">{controller.kind === "atis" ? "ATIS" : "VATSIM ATC"}</span></div><p className="ba-radar-route">{controller.frequency}</p><p className="ba-radar-aircraft-name">{controller.facilityName}<br />{controller.facility} position</p><div className="ba-radar-selected-data"><div><span>Coverage</span><strong>{controller.visualRangeNm === null ? "Not published" : `${controller.visualRangeNm} NM`}</strong></div><div><span>Online</span><strong>{controllerAge(controller)}</strong></div></div>{controller.atis.length ? <div className="ba-radar-controller-atis"><span>Controller information</span><p>{controller.atis.slice(0, 3).join(" · ")}</p></div> : null}<p className="ba-radar-selected-foot">Live VATSIM network data. Verify active frequencies in your pilot client before use.</p></div> : selected ? <FlightTrackerDetails flight={selected} /> : <div className="ba-radar-zero-state"><strong>No active flight selected</strong><span>Choose a BAV aircraft or VATSIM controller from the map.</span></div>}
        <div className="ba-radar-list-controls"><span>Flight list</span><div>{(["all", "airborne", "ground"] as const).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "airborne" ? "Air" : "Ground"}</button>)}</div></div>
        <div className="ba-radar-flight-list">{visibleFlights.length ? visibleFlights.map((flight) => <button key={flight.id} type="button" onClick={() => selectFlight(flight.id)} className={flight.id === selected?.id && !controller ? "selected" : ""}><i className={flight.connectionHealthy ? "connected" : "stale"} /><span><strong>{flight.flightNumber}</strong><small>{flight.from} → {flight.diversionAirport ?? flight.to}{flight.diversionAirport ? " · DIVERTING" : ""}</small></span><em>{flight.lastSnapshot ? `${Math.round(flight.lastSnapshot.altitudeFt).toLocaleString()} ft` : "Pending"}</em></button>) : <p className="ba-radar-none">No flights match this view.</p>}</div>
        <div className="ba-radar-vatsim-summary"><strong>VATSIM network</strong><span>{layers.vatsim ? vatsim?.available === false ? "Live feed unavailable — BAV tracking remains online." : `${vatsim?.onlineCount ?? 0} controllers currently online` : "ATC layer is switched off."}</span></div>
        <p className="ba-radar-sidebar-note">BA-Radar is a read-only flight-simulation map, not an air traffic control service. Confirm all operational instructions in your pilot client.</p>
      </aside>
      <div className="ba-radar-map-wrap">
        <div className="ba-radar-map">
          <BaRadarMap flights={visibleFlights} selectedId={selected?.id ?? ""} onSelect={selectFlight} controllers={vatsim?.controllers ?? []} weather={weather} windGrid={windGrid} onWindRendererStatus={setWindRendererStatus} layers={layers} selectedController={selectedController} onSelectController={selectController} />
          <div className="ba-radar-layer-controls" role="group" aria-label="BA-Radar map layers">
            <strong>Map layers</strong>
            {layerLabels.map((layer) => <button key={layer.key} type="button" className={layers[layer.key] ? "active" : ""} onClick={() => toggleLayer(layer.key)} aria-pressed={layers[layer.key]} title={layer.detail}>{layer.label}</button>)}
            {layers.winds ? <label className="ba-radar-layer-select"><span>Wind altitude</span><select value={windLayer} onChange={(event) => setWindLayer(event.target.value as RadarWindLayerId)}>{RADAR_WIND_LAYERS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select><small>{windError || (windRendererStatus === "unsupported" ? "This browser cannot run the GPU wind view. Update its graphics driver or use another browser." : windGrid ? `GFS analysis · ${new Date(windGrid.validAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC` : "Loading the latest GFS wind field…")}</small></label> : null}
            {layers.lightning ? <p className="ba-radar-layer-note">Observed satellite flash coverage from EUMETSAT. Blank areas outside its field of view are not a “no lightning” guarantee.</p> : null}
          </div>
          <details className="ba-radar-mobile-layer-menu">
            <summary aria-label={`Map layers, ${activeLayerCount} active`}><span>Layers</span><b>{activeLayerCount} active</b><i aria-hidden="true">⌄</i></summary>
            <div className="ba-radar-mobile-layer-list" role="group" aria-label="BA-Radar map layers">
              {layerLabels.map((layer) => <button key={layer.key} type="button" className={layers[layer.key] ? "active" : ""} onClick={() => toggleLayer(layer.key)} aria-pressed={layers[layer.key]} title={layer.detail}>{layer.label}</button>)}
              {layers.winds ? <label className="ba-radar-layer-select"><span>Wind altitude</span><select value={windLayer} onChange={(event) => setWindLayer(event.target.value as RadarWindLayerId)}>{RADAR_WIND_LAYERS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select><small>{windError || (windRendererStatus === "unsupported" ? "This browser cannot run the GPU wind view. Update its graphics driver or use another browser." : windGrid ? `GFS analysis · ${new Date(windGrid.validAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC` : "Loading the latest GFS wind field…")}</small></label> : null}
              {layers.lightning ? <p className="ba-radar-layer-note">Observed satellite flash coverage from EUMETSAT. Blank areas outside its field of view are not a “no lightning” guarantee.</p> : null}
            </div>
          </details>
          <div className="ba-radar-map-key"><span><i /> BAV connected</span><span><i className="stale" /> Delayed link</span>{selected?.plannedRoute ? <span><i className="planned-route" /> Planned route</span> : null}{selected?.trackSnapshots.length ? <span><i className="recorded-track" /> Recorded track</span> : null}{layers.vatsim ? <span><i className="vatsim" /> VATSIM ATC</span> : null}</div>
          {!positioned.length && !hasExternalMapData ? <div className="ba-radar-empty"><strong>Waiting for live flights</strong><span>Aircraft appear as soon as a pilot starts an active Ember ACARS session.</span></div> : null}
        </div>
        <footer className="ba-radar-map-footer"><span>{positioned.length} BAV positions live</span><span>{airborne} BAV airborne</span><span>{layers.vatsim ? "VATSIM Data" : "BAV telemetry"}{needsWeather ? " · Weather layers active" : ""}</span></footer>
      </div>
    </section>
  </div>;
}
