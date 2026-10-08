"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AcarsCabinStatus, AcarsConnectivityStatus } from "@/lib/acars-contract";
import { RADAR_WIND_LAYERS, type RadarWeatherData, type RadarWindGrid, type RadarWindLayerId, type VatsimRadarData, type VatsimStation } from "@/lib/radar-external";
import type { PublicRadarFlight, PublicRadarSnapshot } from "@/lib/radar-live";

const BaRadarMap = dynamic(() => import("@/components/BaRadarMap").then((module) => module.BaRadarMap), {
  ssr: false,
  loading: () => <div className="ba-radar-map-loading">Loading interactive map…</div>,
});

type FlightFilter = "all" | "airborne" | "ground";

type FlightWeatherReport = {
  icao: string;
  metar: string | null;
  taf: string | null;
  sourceUrl: string;
  fetchedAt: string;
  available: boolean;
};

type RadarReplaySummary = {
  id: string;
  flightNumber: string;
  from: string;
  to: string;
  aircraft: string;
  completedAt: string | null;
  distanceNm: number;
  landingFpm: number | null;
};

type RadarReplaySnapshot = {
  timestamp: string;
  latitude: number;
  longitude: number;
  altitudeFt: number;
  groundSpeedKt: number;
  headingDeg: number;
  onGround: boolean;
};

type RadarReplay = RadarReplaySummary & { snapshots: RadarReplaySnapshot[] };

type PrivateOperationPulse = {
  id: string;
  flightNumber: string;
  from: string;
  to: string;
  aircraft: string;
  updatedAt: string;
  cabin: AcarsCabinStatus | null;
  connectivity: AcarsConnectivityStatus | null;
};

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

function watchMilestone(snapshot: PublicRadarSnapshot | null) {
  if (!snapshot) return "Awaiting position";
  if (snapshot.onGround && snapshot.enginesRunning) return "Ground operations";
  if (snapshot.onGround) return "At stand";
  if (snapshot.verticalSpeedFpm != null && snapshot.verticalSpeedFpm < -450 && snapshot.altitudeFt < 18_000) return "Descent";
  if (snapshot.altitudeFt >= 10_000) return "Cruise";
  return "Airborne";
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

function remainingTime(minutes: number | null) {
  if (minutes == null) return "—";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder} min`;
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

function sourceTime(value: Date | null) {
  return value ? telemetryTime(value.toISOString()) : "Connecting";
}

function RadarSourceHealth({ liveCheckedAt, vatsimCheckedAt, weatherCheckedAt, windCheckedAt, layers, liveError, vatsimError, weatherError, windError }: {
  liveCheckedAt: Date | null;
  vatsimCheckedAt: Date | null;
  weatherCheckedAt: Date | null;
  windCheckedAt: Date | null;
  layers: RadarLayers;
  liveError: string;
  vatsimError: string;
  weatherError: string;
  windError: string;
}) {
  const sources = [
    { name: "BAV telemetry", time: liveCheckedAt, note: liveError || "Live positions and flight state" },
    { name: "VATSIM network", time: layers.vatsim ? vatsimCheckedAt : null, note: layers.vatsim ? vatsimError || "Controllers and ATIS" : "Layer switched off" },
    { name: "Weather", time: layers.precipitation || layers.advisories ? weatherCheckedAt : null, note: layers.precipitation || layers.advisories ? weatherError || "Radar and advisory layers" : "Layers switched off" },
    { name: "GFS winds", time: layers.winds ? windCheckedAt : null, note: layers.winds ? windError || "Wind field" : "Layer switched off" },
  ];
  return <details className="ba-radar-source-health">
    <summary><span>Source health</span><b>Live status</b><i aria-hidden="true">⌄</i></summary>
    <div>{sources.map((source) => <article key={source.name} className={source.time ? "available" : source.note.includes("switched off") ? "off" : "waiting"}><i aria-hidden="true" /><span><strong>{source.name}</strong><small>{source.note}</small></span><time>{source.time ? sourceTime(source.time) : source.note.includes("switched off") ? "Off" : "Waiting"}</time></article>)}</div>
  </details>;
}

function AirportOperations({ flights, airport, onAirportChange, watched, onToggleWatch, onSelectFlight }: {
  flights: PublicRadarFlight[];
  airport: string;
  onAirportChange: (airport: string) => void;
  watched: boolean;
  onToggleWatch: () => void;
  onSelectFlight: (id: string) => void;
}) {
  const stations = useMemo(() => [...new Set(flights.flatMap((flight) => [flight.from, flight.to]).filter(Boolean))].sort(), [flights]);
  const movements = airport ? flights.filter((flight) => flight.from === airport || flight.to === airport) : [];
  const departures = movements.filter((flight) => flight.from === airport).length;
  const arrivals = movements.filter((flight) => flight.to === airport).length;

  return <section className="ba-radar-airport-ops" aria-label="Airport operations">
    <header><div><span>Airport operations</span><strong>Live BAV movements</strong></div>{airport ? <button type="button" onClick={onToggleWatch}>{watched ? "Watching" : "Watch airport"}</button> : null}</header>
    <label><span>Airport view</span><select value={airport} onChange={(event) => onAirportChange(event.target.value)}><option value="">Choose an active station</option>{stations.map((station) => <option key={station} value={station}>{station}</option>)}</select></label>
    {airport ? <><div className="ba-radar-airport-counts"><div><span>Departures</span><strong>{departures}</strong></div><div><span>Arrivals</span><strong>{arrivals}</strong></div></div><div className="ba-radar-airport-movements">{movements.length ? movements.slice(0, 4).map((flight) => <button key={flight.id} type="button" onClick={() => onSelectFlight(flight.id)}><span><strong>{flight.flightNumber}</strong><small>{flight.from === airport ? `to ${flight.diversionAirport ?? flight.to}` : `from ${flight.from}`}</small></span><em>{flight.lastSnapshot?.onGround ? "Ground" : flight.lastSnapshot ? "Airborne" : "Pending"}</em></button>) : <p>No active BAV movements at this station.</p>}</div><small className="ba-radar-airport-note">Live BAV activity only. Use the VATSIM layer for network coverage and ATIS.</small></> : <p className="ba-radar-airport-empty">Choose one of today’s active BAV stations to see its departures and arrivals.</p>}
  </section>;
}

function ReplayDetail({ replay, activeIndex, playing, onChangeIndex, onTogglePlayback }: {
  replay: RadarReplay;
  activeIndex: number;
  playing: boolean;
  onChangeIndex: (index: number) => void;
  onTogglePlayback: () => void;
}) {
  const point = replay.snapshots[Math.max(0, Math.min(activeIndex, replay.snapshots.length - 1))] ?? null;
  return <div className="ba-radar-selected-flight ba-radar-replay-detail">
    <header className="ba-radar-tracker-flight-head"><div><span>PRIVATE FLIGHT REPLAY</span><strong>{replay.flightNumber}</strong><small>{replay.from} → {replay.to} · {replay.aircraft}</small></div><i className="ba-radar-connection connected">Replay</i></header>
    {replay.snapshots.length > 1 ? <div className="ba-radar-replay-controls"><div><button type="button" onClick={onTogglePlayback}>{playing ? "Pause replay" : activeIndex >= replay.snapshots.length - 1 ? "Replay again" : "Play replay"}</button><span>{activeIndex + 1} / {replay.snapshots.length} samples</span></div><input type="range" min="0" max={replay.snapshots.length - 1} value={activeIndex} onChange={(event) => onChangeIndex(Number(event.target.value))} aria-label="Flight replay position" /><p>{point ? `${telemetryTime(point.timestamp)} · ${Math.round(point.altitudeFt).toLocaleString()} ft · ${Math.round(point.groundSpeedKt)} kt` : "Position data is unavailable."}</p></div> : <p className="ba-radar-pending">This completed flight does not yet contain enough position samples for a route replay.</p>}
    <div className="ba-radar-tracker-aircraft"><div><span>Distance</span><strong>{replay.distanceNm.toLocaleString()} NM</strong></div><div><span>Landing rate</span><strong>{replay.landingFpm == null ? "—" : `${replay.landingFpm} fpm`}</strong></div><div><span>Completed</span><strong>{replay.completedAt ? telemetryTime(replay.completedAt) : "—"}</strong></div></div>
    <p className="ba-radar-selected-foot">Replays are private to your BAV account. They use your recorded Ember position reports and never expose passenger or booking details.</p>
  </div>;
}

function sentenceCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function PrivateOnboardPulse({ operation }: { operation: PrivateOperationPulse | null }) {
  if (!operation) return null;
  const cabin = operation.cabin;
  const connectivity = operation.connectivity;
  const technicalLabel = cabin?.technicalEventState === "event_filed" ? "Fleet event filed" : cabin?.technicalEventState === "held" ? "Event held" : cabin?.technicalEventState === "unavailable" ? "Monitor unavailable" : cabin?.technicalEventState === "disabled" ? "Monitor off" : "Monitoring";
  return <section className="ba-radar-onboard-pulse" aria-label="My Ember cabin and connectivity pulse">
    <header><div><span>My Ember operation</span><strong>Cabin & connectivity pulse</strong><small>{operation.flightNumber} · {operation.from} → {operation.to} · {operation.aircraft}</small></div><time>{telemetryTime(operation.updatedAt)}</time></header>
    {cabin || connectivity ? <div className="ba-radar-onboard-grid">
      <article><span>Cabin</span><strong>{cabin ? sentenceCase(cabin.flightPhase) : "Awaiting Ember"}</strong><small>{cabin ? `${cabin.boardedPassengerCount} on board · seat belts ${cabin.seatbeltSignOn ? "on" : "off"}` : "Install the current Ember update to send cabin status."}</small></article>
      <article><span>Service</span><strong>{cabin ? sentenceCase(cabin.serviceState) : "Pending"}</strong><small>{cabin ? technicalLabel : "No technical state received."}</small></article>
      <article><span>Cabin Wi-Fi</span><strong>{connectivity ? connectivity.enabled ? "Available" : "Paused" : "Awaiting Ember"}</strong><small>{connectivity ? `${connectivity.onlinePassengerCount} online · ${connectivity.connectedDeviceCount} devices` : "No connectivity model received."}</small></article>
      <article><span>Network demand</span><strong>{connectivity ? `${connectivity.downlinkMbps.toFixed(1)} ↓ · ${connectivity.uplinkMbps.toFixed(1)} ↑ Mbps` : "—"}</strong><small>{connectivity ? `${connectivity.latencyMs} ms · ${connectivity.linkQualityPercent.toFixed(0)}% link quality` : "Waiting for the next ACARS sample."}</small></article>
    </div> : <p className="ba-radar-onboard-pending">Your active flight is connected. Cabin and connectivity status will appear after the current Ember update sends its first telemetry sample.</p>}
    <p className="ba-radar-onboard-note">Private to your BAV account. Cabin Wi-Fi is Ember’s live passenger-demand model; it does not query Starlink, satellites or passenger devices. SayIntentions status never includes a key or transcript.</p>
  </section>;
}

function FlightTrackerDetails({ flight, weatherReports, layers, vatsimOnline, following, onToggleFollow }: { flight: PublicRadarFlight; weatherReports: FlightWeatherReport[]; layers: RadarLayers; vatsimOnline: number | null; following: boolean; onToggleFollow: () => void }) {
  const snapshot = flight.lastSnapshot;
  return <div className="ba-radar-selected-flight ba-radar-flight-tracker-detail">
    <header className="ba-radar-tracker-flight-head">
      <div><span>BA-RADAR LIVE FLIGHT</span><strong>{flight.callsign}</strong><small>Flight number {flight.flightNumber}</small></div>
      <div className="ba-radar-flight-head-actions"><button type="button" onClick={onToggleFollow} aria-pressed={following}>{following ? "Following" : "Follow flight"}</button><i className={flight.connectionHealthy ? "ba-radar-connection connected" : "ba-radar-connection stale"}>{flight.connectionHealthy ? "Live" : "Delayed"}</i></div>
    </header>
    {flight.aircraftImage ? <a className="ba-radar-tracker-photo" href={flight.aircraftImage.sourcePageUrl ?? flight.aircraftImage.url} target="_blank" rel="noreferrer" title={`View photo source: ${flight.aircraftImage.source}`}><img src={flight.aircraftImage.url} alt={`${flight.registration ?? flight.aircraft} aircraft`} /><span>Photo · {flight.aircraftImage.source}</span></a> : <div className="ba-radar-tracker-photo ba-radar-tracker-photo-empty" aria-hidden="true">✈</div>}
    <div className="ba-radar-tracker-route">
      <div><span>Departure</span><strong>{flight.from}</strong></div><b aria-hidden="true">✈</b><div><span>{flight.diversionAirport ? "Planned arrival" : "Arrival"}</span><strong>{flight.to}</strong></div>
    </div>
    {flight.diversionAirport ? <div className="ba-radar-diversion-notice"><strong>DIVERTING</strong><span>Ember reports {flight.diversionAirport} as the diversion airport.</span></div> : null}
    {snapshot ? <>
      <TrackerSection title="Route trace">
        {flight.plannedRoute ? <p className="ba-radar-route-trace"><strong>{flight.plannedRoute.source === "simbrief" ? "SimBrief planned route" : "Direct airport route"}</strong><span>{flight.plannedRoute.points.length.toLocaleString()} plotted route points. The dashed blue line is the planned route; the solid gold line is the aircraft’s recorded track.</span></p> : <p className="ba-radar-route-trace"><strong>Planned route pending</strong><span>Sync the SimBrief OFP for this assignment to show its planned route on BA-Radar. The recorded track remains available.</span></p>}
      </TrackerSection>
      <TrackerSection title="Flight timeline" open>
        {flight.journeyProgress ? <div className="ba-radar-flight-timeline">
          <div className="ba-radar-timeline-label"><strong>{flight.journeyProgress.progressPercent.toFixed(0)}% complete</strong><span>{flight.diversionAirport ? "Progress remains against the planned route" : "Projected from the live simulator position"}</span></div>
          <div className="ba-radar-timeline-track" role="progressbar" aria-label="Flight progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(flight.journeyProgress.progressPercent)}><i style={{ width: `${flight.journeyProgress.progressPercent}%` }} /></div>
          <div className="ba-radar-tracker-aircraft ba-radar-timeline-data"><div><span>Distance remaining</span><strong>{Math.round(flight.journeyProgress.remainingDistanceNm).toLocaleString()} NM</strong></div><div><span>Estimated time remaining</span><strong>{remainingTime(flight.journeyProgress.estimatedRemainingMinutes)}</strong></div><div><span>Planned distance</span><strong>{Math.round(flight.journeyProgress.plannedDistanceNm).toLocaleString()} NM</strong></div><div><span>Distance flown</span><strong>{Math.round(flight.distanceNm).toLocaleString()} NM</strong></div></div>
        </div> : <p className="ba-radar-telemetry-empty">Timeline will appear after an active SimBrief route and a live aircraft position are available.</p>}
      </TrackerSection>
      <TrackerSection title="Operations briefing">
        <div className="ba-radar-operations-brief"><div><span>Route source</span><strong>{flight.plannedRoute?.source === "simbrief" ? "SimBrief flight plan" : flight.plannedRoute ? "Direct airport route" : "Route awaiting briefing"}</strong></div><div><span>Weather brief</span><strong>{flight.weatherStations.length ? `${flight.weatherStations.length} station${flight.weatherStations.length === 1 ? "" : "s"} linked` : "No stations linked"}</strong></div><div><span>Map awareness</span><strong>{[layers.precipitation && "Radar", layers.winds && "Winds", layers.lightning && "Lightning", layers.advisories && "Hazards"].filter(Boolean).join(" · ") || "Base map"}</strong></div><div><span>Network</span><strong>{layers.vatsim ? `${vatsimOnline ?? 0} VATSIM positions` : "VATSIM layer off"}</strong></div></div>
        <p className="ba-radar-brief-note">This is simulation planning context, not a real-world dispatch release. Confirm live ATC and weather in your pilot client.</p>
      </TrackerSection>
      <TrackerSection title="Aircraft">
        <div className="ba-radar-tracker-aircraft"><div><span>Registration</span><strong>{flight.registration ?? "Pending"}</strong></div><div><span>Aircraft type</span><strong>{flight.aircraft}</strong></div><div><span>Simulator</span><strong>{simulatorLabels[flight.simulator]}</strong></div></div>
      </TrackerSection>
      <TrackerSection title="Live METAR & TAF">
        {flight.weatherStations.length ? <div className="ba-radar-flight-weather">{flight.weatherStations.map((station) => {
          const report = weatherReports.find((entry) => entry.icao === station.icao);
          return <article key={`${station.role}-${station.icao}`}>
            <header><span>{station.role}</span><strong>{station.icao}</strong>{report?.available ? <a href={report.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a> : null}</header>
            {report ? report.available ? <><p><b>METAR</b>{report.metar ?? "No current METAR published."}</p><p><b>TAF</b>{report.taf ?? "No current TAF published."}</p><small>Fetched {telemetryTime(report.fetchedAt)}</small></> : <p className="unavailable">Live report temporarily unavailable. <a href={report.sourceUrl} target="_blank" rel="noreferrer">Open AllMetsat ↗</a></p> : <p className="loading">Loading current aviation weather…</p>}
          </article>;
        })}</div> : <p className="ba-radar-telemetry-empty">Sync a SimBrief OFP to include its alternate; departure and arrival weather will then refresh here.</p>}
      </TrackerSection>
      <TrackerSection title="Live flight data" open>
        <div className="ba-radar-selected-data ba-radar-flight-data">
          <div><span>Altitude</span><strong>{Math.round(snapshot.altitudeFt).toLocaleString()} ft</strong></div>
          <div><span>Vertical speed</span><strong>{snapshot.verticalSpeedFpm == null ? "—" : `${Math.round(snapshot.verticalSpeedFpm).toLocaleString()} fpm`}</strong></div>
          <div><span>Ground speed</span><strong>{Math.round(snapshot.groundSpeedKt)} kt</strong></div>
          <div><span>Indicated airspeed</span><strong>{snapshot.indicatedAirspeedKt == null ? "—" : `${Math.round(snapshot.indicatedAirspeedKt)} kt`}</strong></div>
          <div><span>True airspeed</span><strong>{snapshot.trueAirspeedKt == null ? "—" : `${Math.round(snapshot.trueAirspeedKt)} kt`}</strong></div>
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
  const [liveCheckedAt, setLiveCheckedAt] = useState<Date | null>(null);
  const [liveError, setLiveError] = useState("");
  const [layers, setLayers] = useState<RadarLayers>({ vatsim: true, precipitation: false, winds: false, lightning: false, advisories: false });
  const [windLayer, setWindLayer] = useState<RadarWindLayerId>("surface");
  const [vatsim, setVatsim] = useState<VatsimRadarData | null>(null);
  const [vatsimCheckedAt, setVatsimCheckedAt] = useState<Date | null>(null);
  const [vatsimError, setVatsimError] = useState("");
  const [weather, setWeather] = useState<RadarWeatherData | null>(null);
  const [weatherCheckedAt, setWeatherCheckedAt] = useState<Date | null>(null);
  const [weatherError, setWeatherError] = useState("");
  const [windGrid, setWindGrid] = useState<RadarWindGrid | null>(null);
  const [windCheckedAt, setWindCheckedAt] = useState<Date | null>(null);
  const [windError, setWindError] = useState("");
  const [windRendererStatus, setWindRendererStatus] = useState<"loading" | "ready" | "unsupported">("loading");
  const [selectedController, setSelectedController] = useState("");
  const [flightWeather, setFlightWeather] = useState<{ stationKey: string; reports: FlightWeatherReport[] }>({ stationKey: "", reports: [] });
  const [watchedFlightIds, setWatchedFlightIds] = useState<string[]>([]);
  const [watchedStations, setWatchedStations] = useState<string[]>([]);
  const [watchHydrated, setWatchHydrated] = useState(false);
  const [watchAlertsEnabled, setWatchAlertsEnabled] = useState(false);
  const watchedPhaseRef = useRef(new Map<string, string>());
  const [airport, setAirport] = useState("");
  const [replayLibrary, setReplayLibrary] = useState<RadarReplaySummary[]>([]);
  const [replay, setReplay] = useState<RadarReplay | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayLoadingId, setReplayLoadingId] = useState("");
  const [onboardPulse, setOnboardPulse] = useState<PrivateOperationPulse | null>(null);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/radar/live", { cache: "no-store" });
        if (!response.ok) throw new Error("Live BAV telemetry could not be refreshed.");
        const payload = await response.json() as { flights?: PublicRadarFlight[] };
        if (mounted && Array.isArray(payload.flights)) {
          setFlights(payload.flights);
          setLiveCheckedAt(new Date());
          setLiveError("");
        }
      } catch {
        // Preserve the last verified public view if a refresh is interrupted.
        if (mounted) setLiveError("Last verified BAV view retained");
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 5_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/radar/operations/active", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { operation?: PrivateOperationPulse | null };
        if (mounted) setOnboardPulse(payload.operation ?? null);
      } catch {
        // The public tracker is always usable even if a private session refresh fails.
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 8_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    try {
      const flightIds = JSON.parse(window.localStorage.getItem("bav-radar-watch-flights") ?? "[]");
      const stations = JSON.parse(window.localStorage.getItem("bav-radar-watch-stations") ?? "[]");
      const alerts = window.localStorage.getItem("bav-radar-watch-alerts") === "enabled";
      if (Array.isArray(flightIds)) setWatchedFlightIds(flightIds.filter((value): value is string => typeof value === "string").slice(0, 24));
      if (Array.isArray(stations)) setWatchedStations(stations.filter((value): value is string => typeof value === "string").slice(0, 24));
      setWatchAlertsEnabled(alerts && "Notification" in window && Notification.permission === "granted");
    } catch {
      // Watchlists are optional browser conveniences; a damaged local entry is ignored.
    } finally {
      setWatchHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!watchHydrated) return;
    window.localStorage.setItem("bav-radar-watch-flights", JSON.stringify(watchedFlightIds));
    window.localStorage.setItem("bav-radar-watch-stations", JSON.stringify(watchedStations));
    window.localStorage.setItem("bav-radar-watch-alerts", watchAlertsEnabled ? "enabled" : "disabled");
  }, [watchHydrated, watchedFlightIds, watchedStations, watchAlertsEnabled]);

  useEffect(() => {
    let mounted = true;
    const loadLibrary = async () => {
      try {
        const response = await fetch("/api/radar/replays", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { replays?: RadarReplaySummary[] };
        if (mounted && Array.isArray(payload.replays)) setReplayLibrary(payload.replays);
      } catch {
        // The public tracker remains fully usable without a signed-in replay library.
      }
    };
    void loadLibrary();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!layers.vatsim) return;
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/radar/vatsim", { cache: "no-store" });
        if (!response.ok) throw new Error("VATSIM data could not be refreshed.");
        const payload = await response.json() as VatsimRadarData;
        if (mounted) {
          setVatsim(payload);
          setVatsimCheckedAt(new Date());
          setVatsimError("");
        }
      } catch {
        // BA-Radar remains useful if VATSIM's public feed is temporarily unavailable.
        if (mounted) setVatsimError("Last verified network view retained");
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
        if (!response.ok) throw new Error("Weather data could not be refreshed.");
        const payload = await response.json() as RadarWeatherData;
        if (mounted) {
          setWeather(payload);
          setWeatherCheckedAt(new Date());
          setWeatherError("");
        }
      } catch {
        // Each layer degrades quietly instead of interrupting simulator tracking.
        if (mounted) setWeatherError("Last verified weather view retained");
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
        if (mounted) {
          setWindGrid(payload);
          setWindCheckedAt(new Date());
        }
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
  const watchedFlights = useMemo(() => watchedFlightIds.map((id) => flights.find((flight) => flight.id === id)).filter((flight): flight is PublicRadarFlight => Boolean(flight)), [watchedFlightIds, flights]);
  const clearSelection = () => { setSelectedId(""); setSelectedController(""); setReplay(null); setReplayPlaying(false); };
  const selectFlight = (id: string) => {
    setSelectedController("");
    setSelectedId((current) => current === id ? "" : id);
    setReplay(null);
    setReplayPlaying(false);
  };
  const selectController = (callsign: string) => {
    setSelectedId("");
    setSelectedController((current) => current === callsign ? "" : callsign);
    setReplay(null);
    setReplayPlaying(false);
  };
  const toggleFlightWatch = (id: string) => setWatchedFlightIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id].slice(-24));
  const toggleStationWatch = (station: string) => setWatchedStations((current) => current.includes(station) ? current.filter((entry) => entry !== station) : [...current, station].slice(-24));
  const toggleLayer = (key: keyof RadarLayers) => setLayers((current) => ({ ...current, [key]: !current[key] }));
  const activeLayerCount = layerLabels.filter((layer) => layers[layer.key]).length;
  const hasExternalMapData = layers.vatsim || needsWeather || layers.winds || layers.lightning;
  const weatherStationKey = selected?.weatherStations.map((station) => station.icao).join(",") ?? "";
  const replayForMap = replay ? { id: replay.id, points: replay.snapshots, activeIndex: replayIndex } : null;

  useEffect(() => {
    const watching = new Set(watchedFlights.map((flight) => flight.id));
    for (const flight of watchedFlights) {
      const currentMilestone = watchMilestone(flight.lastSnapshot);
      const previousMilestone = watchedPhaseRef.current.get(flight.id);
      if (watchAlertsEnabled && previousMilestone && previousMilestone !== currentMilestone && "Notification" in window && Notification.permission === "granted") {
        new Notification(`${flight.flightNumber} · ${currentMilestone}`, { body: `${flight.from} → ${flight.diversionAirport ?? flight.to} is now ${currentMilestone.toLowerCase()} on BA-Radar.` });
      }
      watchedPhaseRef.current.set(flight.id, currentMilestone);
    }
    for (const id of watchedPhaseRef.current.keys()) if (!watching.has(id)) watchedPhaseRef.current.delete(id);
  }, [watchedFlights, watchAlertsEnabled]);

  const enableWatchAlerts = async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setWatchAlertsEnabled(permission === "granted");
  };

  useEffect(() => {
    if (!weatherStationKey) {
      return;
    }
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/radar/flight-weather?stations=${encodeURIComponent(weatherStationKey)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json() as { reports?: FlightWeatherReport[] };
        if (mounted && Array.isArray(payload.reports)) setFlightWeather({ stationKey: weatherStationKey, reports: payload.reports });
      } catch {
        // Retain the last verified airport weather if the supplier is briefly unavailable.
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 5 * 60_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [weatherStationKey]);

  useEffect(() => {
    if (!replay || !replayPlaying || replay.snapshots.length < 2) return;
    const interval = window.setInterval(() => {
      setReplayIndex((current) => Math.min(current + 1, replay.snapshots.length - 1));
    }, 650);
    return () => window.clearInterval(interval);
  }, [replay, replayPlaying]);

  useEffect(() => {
    if (replay && replayIndex >= replay.snapshots.length - 1) setReplayPlaying(false);
  }, [replay, replayIndex]);

  const openReplay = async (id: string) => {
    setReplayLoadingId(id);
    try {
      const response = await fetch(`/api/radar/replays/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { replay?: RadarReplay };
      if (!payload.replay) return;
      setSelectedId("");
      setSelectedController("");
      setReplay(payload.replay);
      setReplayIndex(0);
      setReplayPlaying(false);
    } finally {
      setReplayLoadingId("");
    }
  };

  const toggleReplayPlayback = () => {
    if (!replay?.snapshots.length) return;
    if (replayIndex >= replay.snapshots.length - 1) setReplayIndex(0);
    setReplayPlaying((current) => !current || replayIndex >= replay.snapshots.length - 1);
  };

  return <div className="ba-radar ba-radar-tracker">
    <header className="ba-radar-toolbar">
      <div className="ba-radar-brand"><Image className="ba-radar-brand-mark" src="/branding/ba-radar-icon.png" width={40} height={40} alt="BA-Radar" priority /><div><strong>BA-Radar</strong><small>LIVE VIRTUAL FLIGHT TRACKER</small></div></div>
      <div className="ba-radar-toolbar-status"><i /><span>{flights.length} active</span><b>{airborne} airborne</b>{layers.vatsim ? <span>{vatsim?.onlineCount ?? 0} VATSIM ATC</span> : null}<em>{liveCheckedAt ? `Updated ${liveCheckedAt.toLocaleTimeString("en-GB")}` : "Connecting"}</em><RadarSourceHealth liveCheckedAt={liveCheckedAt} vatsimCheckedAt={vatsimCheckedAt} weatherCheckedAt={weatherCheckedAt} windCheckedAt={windCheckedAt} layers={layers} liveError={liveError} vatsimError={vatsimError} weatherError={weatherError} windError={windError} /></div>
      <label className="ba-radar-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search flights, routes or aircraft" aria-label="Search live flights" /></label>
    </header>
    <section className="ba-radar-stage" aria-label="BA-Radar live simulator map">
      <aside className="ba-radar-sidebar">
        <div className="ba-radar-selection-head"><span className="ba-radar-kicker">{replay ? "Private replay" : controller ? "Selected VATSIM position" : selected ? "Selected live flight" : "Live flights"}</span>{selected || controller || replay ? <button type="button" onClick={clearSelection} aria-label="Clear map selection">Clear <b aria-hidden="true">×</b></button> : null}</div>
        {replay ? <ReplayDetail replay={replay} activeIndex={replayIndex} playing={replayPlaying} onChangeIndex={(index) => { setReplayIndex(index); setReplayPlaying(false); }} onTogglePlayback={toggleReplayPlayback} /> : controller ? <div className="ba-radar-selected-flight ba-radar-controller-detail"><div className="ba-radar-selected-title"><strong>{controller.callsign}</strong><span className="ba-radar-connection connected">{controller.kind === "atis" ? "ATIS" : "VATSIM ATC"}</span></div><p className="ba-radar-route">{controller.frequency}</p><p className="ba-radar-aircraft-name">{controller.facilityName}<br />{controller.facility} position</p><div className="ba-radar-selected-data"><div><span>Coverage</span><strong>{controller.visualRangeNm === null ? "Not published" : `${controller.visualRangeNm} NM`}</strong></div><div><span>Online</span><strong>{controllerAge(controller)}</strong></div></div>{controller.atis.length ? <div className="ba-radar-controller-atis"><span>Controller information</span><p>{controller.atis.slice(0, 3).join(" · ")}</p></div> : null}<p className="ba-radar-selected-foot">Live VATSIM network data. Verify active frequencies in your pilot client before use.</p></div> : selected ? <FlightTrackerDetails flight={selected} weatherReports={flightWeather.stationKey === weatherStationKey ? flightWeather.reports : []} layers={layers} vatsimOnline={vatsim?.onlineCount ?? null} following={watchedFlightIds.includes(selected.id)} onToggleFollow={() => toggleFlightWatch(selected.id)} /> : <div className="ba-radar-zero-state"><strong>No active flight selected</strong><span>Choose a BAV aircraft or VATSIM controller from the map.</span></div>}
        <AirportOperations flights={flights} airport={airport} onAirportChange={setAirport} watched={Boolean(airport && watchedStations.includes(airport))} onToggleWatch={() => airport && toggleStationWatch(airport)} onSelectFlight={selectFlight} />
        {(watchedFlights.length || watchedStations.length) ? <section className="ba-radar-watchlist"><header><div><span>Your watchlist</span><small>Saved in this browser</small></div>{watchAlertsEnabled ? <button className="ba-radar-watch-alerts enabled" type="button" onClick={() => setWatchAlertsEnabled(false)}>Alerts on</button> : <button className="ba-radar-watch-alerts" type="button" onClick={() => void enableWatchAlerts()}>Enable alerts</button>}</header>{watchedFlights.map((flight) => <button key={flight.id} type="button" onClick={() => selectFlight(flight.id)}><i className={flight.connectionHealthy ? "connected" : "stale"} /><span><strong>{flight.flightNumber}</strong><small>{flight.from} → {flight.diversionAirport ?? flight.to}</small></span><b>Open</b></button>)}{watchedStations.map((station) => <button key={station} type="button" onClick={() => setAirport(station)}><i className="station" /><span><strong>{station}</strong><small>Airport watch</small></span><b>View</b></button>)}</section> : null}
        <PrivateOnboardPulse operation={onboardPulse} />
        {replayLibrary.length ? <details className="ba-radar-replay-library"><summary><span>My flight replays</span><b>{replayLibrary.length}</b><i aria-hidden="true">⌄</i></summary><div>{replayLibrary.map((entry) => <button key={entry.id} type="button" disabled={replayLoadingId === entry.id} onClick={() => void openReplay(entry.id)}><span><strong>{entry.flightNumber} · {entry.from} → {entry.to}</strong><small>{entry.aircraft} · {entry.distanceNm.toLocaleString()} NM</small></span><em>{replayLoadingId === entry.id ? "Loading" : "Replay"}</em></button>)}</div></details> : null}
        <div className="ba-radar-list-controls"><span>Flight list</span><div>{(["all", "airborne", "ground"] as const).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "airborne" ? "Air" : "Ground"}</button>)}</div></div>
        <div className="ba-radar-flight-list">{visibleFlights.length ? visibleFlights.map((flight) => <button key={flight.id} type="button" onClick={() => selectFlight(flight.id)} className={flight.id === selected?.id && !controller ? "selected" : ""}><i className={flight.connectionHealthy ? "connected" : "stale"} /><span><strong>{flight.flightNumber}</strong><small>{flight.from} → {flight.diversionAirport ?? flight.to}{flight.diversionAirport ? " · DIVERTING" : ""}</small></span><em>{flight.lastSnapshot ? `${Math.round(flight.lastSnapshot.altitudeFt).toLocaleString()} ft` : "Pending"}</em></button>) : <p className="ba-radar-none">No flights match this view.</p>}</div>
        <div className="ba-radar-vatsim-summary"><strong>VATSIM network</strong><span>{layers.vatsim ? vatsim?.available === false ? "Live feed unavailable — BAV tracking remains online." : `${vatsim?.onlineCount ?? 0} controllers currently online` : "ATC layer is switched off."}</span></div>
        <p className="ba-radar-sidebar-note">BA-Radar is a read-only flight-simulation map, not an air traffic control service. Confirm all operational instructions in your pilot client.</p>
      </aside>
      <div className="ba-radar-map-wrap">
        <div className="ba-radar-map">
          <BaRadarMap flights={visibleFlights} selectedId={selected?.id ?? ""} onSelect={selectFlight} controllers={vatsim?.controllers ?? []} weather={weather} windGrid={windGrid} onWindRendererStatus={setWindRendererStatus} layers={layers} selectedController={selectedController} onSelectController={selectController} replay={replayForMap} />
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
          <div className="ba-radar-map-key"><span><i /> BAV connected</span><span><i className="stale" /> Delayed link</span>{selected?.plannedRoute ? <span><i className="planned-route" /> Planned route</span> : null}{selected?.trackSnapshots.length ? <span><i className="recorded-track" /> Recorded track</span> : null}{replay ? <span><i className="replay-track" /> Private replay</span> : null}{layers.vatsim ? <span><i className="vatsim" /> VATSIM ATC</span> : null}</div>
          {!positioned.length && !hasExternalMapData ? <div className="ba-radar-empty"><strong>Waiting for live flights</strong><span>Aircraft appear as soon as a pilot starts an active Ember ACARS session.</span></div> : null}
        </div>
        <footer className="ba-radar-map-footer"><span>{replay ? "Private replay active" : `${positioned.length} BAV positions live`}</span><span>{replay ? `${replayIndex + 1} / ${replay.snapshots.length} samples` : `${airborne} BAV airborne`}</span><span>{layers.vatsim ? "VATSIM Data" : "BAV telemetry"}{needsWeather ? " · Weather layers active" : ""}</span></footer>
      </div>
    </section>
  </div>;
}
