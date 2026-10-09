"use client";

import L from "leaflet";
import { GeoJSON, MapContainer, Marker, Pane, Polyline, SVGOverlay, TileLayer, WMSTileLayer, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useState } from "react";
import type { RadarWeatherData, RadarWindGrid, VatsimStation } from "@/lib/radar-external";
import type { RadarLayers } from "@/components/PublicBaRadar";
import type { PublicRadarFlight } from "@/lib/radar-live";
import { BaRadarWindField } from "@/components/BaRadarWindField";

type Position = [number, number];

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function normaliseHeading(headingDeg: number) {
  return ((headingDeg % 360) + 360) % 360;
}

function aircraftIcon(flight: PublicRadarFlight, selected: boolean) {
  const snapshot = flight.lastSnapshot!;
  const heading = Math.round(normaliseHeading(snapshot.headingDeg));
  return L.divIcon({
    className: "ba-radar-leaflet-icon-shell",
    // The SVG is drawn nose-up, so true heading 000° points north on the map.
    html: `<span class="ba-radar-leaflet-icon ${selected ? "selected" : ""} ${flight.connectionHealthy ? "connected" : "stale"}"><b style="--aircraft-heading:${heading}deg"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.1 1.4c.5-.7 1.3-.7 1.8 0L15.1 9l6.3 2.5v2l-6.2-.7-1.2 4.4 2.5 1.5v1.6L12 19.4l-4.5.9v-1.6l2.5-1.5-1.2-4.4-6.2.7v-2L8.9 9l2.2-7.6Z" /></svg></b><em>${escapeHtml(flight.callsign)}</em></span>`,
    iconSize: [58, 49],
    iconAnchor: [29, 24],
  });
}

function replayIcon(headingDeg: number) {
  const heading = Math.round(normaliseHeading(headingDeg));
  return L.divIcon({
    className: "ba-radar-replay-icon-shell",
    html: `<span class="ba-radar-replay-icon" title="Replay position"><b style="--aircraft-heading:${heading}deg"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.1 1.4c.5-.7 1.3-.7 1.8 0L15.1 9l6.3 2.5v2l-6.2-.7-1.2 4.4 2.5 1.5v1.6L12 19.4l-4.5.9v-1.6l2.5-1.5-1.2-4.4-6.2.7v-2L8.9 9l2.2-7.6Z" /></svg></b></span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function trackStartIcon(flight: PublicRadarFlight, isGroundPosition: boolean) {
  const label = isGroundPosition ? `${flight.from} ground start` : `${flight.from} first report`;
  return L.divIcon({
    className: "ba-radar-track-start-icon-shell",
    html: `<span class="ba-radar-track-start-icon ${isGroundPosition ? "ground" : "airborne"}"><b>${isGroundPosition ? "G" : "•"}</b><em>${escapeHtml(label)}</em></span>`,
    iconSize: [92, 31],
    iconAnchor: [10, 15],
  });
}

function controllerIcon(controller: VatsimStation, selected: boolean) {
  const isAtis = controller.kind === "atis";
  return L.divIcon({
    className: "ba-radar-vatsim-icon-shell",
    html: `<span class="ba-radar-vatsim-icon ${isAtis ? "atis" : "controller"} ${selected ? "selected" : ""}" title="${escapeHtml(`${controller.callsign} · ${controller.frequency}`)}"><b>${isAtis ? "ATIS" : escapeHtml(controller.facility)}</b></span>`,
    iconSize: [34, 22],
    iconAnchor: [17, 11],
  });
}

function hasLocation(controller: VatsimStation): controller is VatsimStation & { latitude: number; longitude: number } {
  return controller.latitude !== null && controller.longitude !== null;
}

function isUkPriorityController(controller: VatsimStation) {
  return /^(EG|EI)/.test(controller.callsign);
}

function OfficialLightningLayer({ enabled }: { enabled: boolean }) {
  const [revision, setRevision] = useState(() => Math.floor(Date.now() / 120_000));
  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => setRevision(Math.floor(Date.now() / 120_000)), 120_000);
    return () => window.clearInterval(interval);
  }, [enabled]);
  if (!enabled) return null;
  return <WMSTileLayer
    key={revision}
    url={`https://view.eumetsat.int/geoserver/wms?ba-radar-cache=${revision}`}
    params={{ layers: "mtg_fd:li_afa", format: "image/png", transparent: true, version: "1.3.0" }}
    opacity={0.86}
    attribution={'Observed lightning &copy; <a href="https://www.eumetsat.int/" target="_blank" rel="noreferrer">EUMETSAT</a>'}
  />;
}

function SeasonalAuroraLayer({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return <Pane name="ba-radar-seasonal-aurora" className="ba-radar-seasonal-aurora-pane" style={{ zIndex: 500, pointerEvents: "none" }}>
    <SVGOverlay bounds={[[58, -180], [85, 180]]} opacity={0.88} interactive={false} attributes={{ viewBox: "0 0 1200 560", preserveAspectRatio: "none", class: "ba-radar-aurora-svg" }}>
      <defs>
        <linearGradient id="ba-radar-aurora-main" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#56c9ff" stopOpacity="0" />
          <stop offset="0.26" stopColor="#74dfff" stopOpacity="0.16" />
          <stop offset="0.52" stopColor="#63f2b0" stopOpacity="0.53" />
          <stop offset="0.74" stopColor="#7a91ff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#6dffcc" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="ba-radar-aurora-second" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#3bb4ff" stopOpacity="0" />
          <stop offset="0.43" stopColor="#6dffd5" stopOpacity="0.32" />
          <stop offset="0.65" stopColor="#a39aff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#3fd2ff" stopOpacity="0" />
        </linearGradient>
        <filter id="ba-radar-aurora-soft" x="-12%" y="-60%" width="124%" height="220%"><feGaussianBlur stdDeviation="7" /></filter>
      </defs>
      <path d="M-90 300 C 130 212, 300 352, 506 270 S 883 214, 1290 298 L 1290 414 C 1042 342, 784 449, 521 372 S 112 451, -90 387 Z" fill="url(#ba-radar-aurora-main)" filter="url(#ba-radar-aurora-soft)">
        <animateTransform attributeName="transform" type="translate" values="-46 7;34 -9;-46 7" dur="27s" repeatCount="indefinite" />
      </path>
      <path d="M-65 411 C 177 315, 351 447, 609 370 S 1004 314, 1260 390 L 1260 479 C 1009 424, 843 520, 612 456 S 142 524, -65 485 Z" fill="url(#ba-radar-aurora-second)" filter="url(#ba-radar-aurora-soft)" opacity="0.76">
        <animateTransform attributeName="transform" type="translate" values="39 -4;-42 10;39 -4" dur="35s" repeatCount="indefinite" />
      </path>
    </SVGOverlay>
  </Pane>;
}

function MapLayers({
  controllers,
  weather,
  windGrid,
  onWindRendererStatus,
  layers,
  selectedController,
  onSelectController,
}: {
  controllers: VatsimStation[];
  weather: RadarWeatherData | null;
  windGrid: RadarWindGrid | null;
  onWindRendererStatus: (status: "ready" | "unsupported") => void;
  layers: RadarLayers;
  selectedController: string;
  onSelectController: (callsign: string) => void;
}) {
  const map = useMap();
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }));
  useMapEvents({
    moveend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }),
    zoomend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }),
  });

  const controllerMarkers = controllers.filter(hasLocation).filter((controller) => {
    if (view.zoom < 3) return isUkPriorityController(controller);
    return view.bounds.pad(0.2).contains([controller.latitude, controller.longitude]);
  });
  return <>
    {layers.precipitation && weather?.precipitation ? <TileLayer
      url={weather.precipitation.tileUrl}
      opacity={0.58}
      maxNativeZoom={7}
      maxZoom={11}
      attribution={'Weather radar &copy; <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>'}
    /> : null}
    {layers.advisories && weather?.advisories.features.length ? <GeoJSON
      data={weather.advisories as never}
      style={{ color: "#ff9f43", weight: 2, fillColor: "#e45454", fillOpacity: 0.2 }}
    /> : null}
    <OfficialLightningLayer enabled={layers.lightning} />
    <BaRadarWindField windGrid={windGrid} enabled={layers.winds} onStatus={onWindRendererStatus} />
    {layers.vatsim ? controllerMarkers.map((controller) => <Marker key={`${controller.kind}:${controller.callsign}`} position={[controller.latitude, controller.longitude]} icon={controllerIcon(controller, controller.callsign === selectedController)} eventHandlers={{ click: () => onSelectController(controller.callsign) }} />) : null}
  </>;
}

export function BaRadarMap({
  flights,
  selectedId,
  onSelect,
  controllers,
  weather,
  windGrid,
  onWindRendererStatus,
  layers,
  selectedController,
  onSelectController,
  replay,
}: {
  flights: PublicRadarFlight[];
  selectedId: string;
  onSelect: (id: string) => void;
  controllers: VatsimStation[];
  weather: RadarWeatherData | null;
  windGrid: RadarWindGrid | null;
  onWindRendererStatus: (status: "ready" | "unsupported") => void;
  layers: RadarLayers;
  selectedController: string;
  onSelectController: (callsign: string) => void;
  replay: { id: string; points: Array<{ latitude: number; longitude: number; headingDeg: number }>; activeIndex: number } | null;
}) {
  const positioned = flights.filter((flight) => flight.lastSnapshot);
  const selected = positioned.find((flight) => flight.id === selectedId) ?? null;
  const plannedRoute: Position[] = (selected?.plannedRoute?.points ?? [])
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
    .map((point) => [point.latitude, point.longitude]);
  const trackSnapshots = selected?.trackSnapshots?.length ? selected.trackSnapshots : selected?.recentSnapshots ?? [];
  const track: Position[] = trackSnapshots
    .filter((snapshot) => Number.isFinite(snapshot.latitude) && Number.isFinite(snapshot.longitude))
    .map((snapshot) => [snapshot.latitude, snapshot.longitude]);
  const trackStart = trackSnapshots.find((snapshot) => Number.isFinite(snapshot.latitude) && Number.isFinite(snapshot.longitude)) ?? null;
  const replayTrack: Position[] = (replay?.points ?? [])
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
    .map((point) => [point.latitude, point.longitude]);
  const replayPoint = replay && replay.points.length
    ? replay.points[Math.max(0, Math.min(replay.activeIndex, replay.points.length - 1))]
    : null;

  return <MapContainer className={`ba-radar-leaflet-map${layers.seasonal ? " ba-radar-winter-map" : ""}`} center={[27, -13]} zoom={2} minZoom={2} maxZoom={19} worldCopyJump scrollWheelZoom>
    <TileLayer
      className="ba-radar-base-tiles"
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
      maxNativeZoom={19}
      maxZoom={19}
    />
    <SeasonalAuroraLayer enabled={layers.seasonal} />
    <MapLayers controllers={controllers} weather={weather} windGrid={windGrid} onWindRendererStatus={onWindRendererStatus} layers={layers} selectedController={selectedController} onSelectController={onSelectController} />
    {plannedRoute.length > 1 ? <Polyline positions={plannedRoute} pathOptions={{ color: "#73bdf1", weight: 2.5, opacity: 0.8, dashArray: "7 10", lineCap: "round", lineJoin: "round", className: "ba-radar-planned-route" }} /> : null}
    {track.length > 1 ? <Polyline positions={track} pathOptions={{ color: "#f1c84c", weight: 3.5, opacity: 0.96, lineCap: "round", lineJoin: "round", className: "ba-radar-recorded-track" }} /> : null}
    {selected && trackStart ? <Marker position={[trackStart.latitude, trackStart.longitude]} icon={trackStartIcon(selected, "onGround" in trackStart ? trackStart.onGround : false)} interactive={false} zIndexOffset={500} /> : null}
    {replayTrack.length > 1 ? <Polyline positions={replayTrack} pathOptions={{ color: "#d91e45", weight: 3.5, opacity: 0.92, lineCap: "round", lineJoin: "round", className: "ba-radar-replay-track" }} /> : null}
    {replayPoint ? <Marker position={[replayPoint.latitude, replayPoint.longitude]} icon={replayIcon(replayPoint.headingDeg)} zIndexOffset={900} /> : null}
    {positioned.map((flight) => <Marker key={flight.id} position={[flight.lastSnapshot!.latitude, flight.lastSnapshot!.longitude]} icon={aircraftIcon(flight, flight.id === selectedId)} eventHandlers={{ click: () => onSelect(flight.id) }} />)}
  </MapContainer>;
}
