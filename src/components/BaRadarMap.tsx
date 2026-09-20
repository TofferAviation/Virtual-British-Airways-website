"use client";

import L from "leaflet";
import { GeoJSON, MapContainer, Marker, Polyline, TileLayer, WMSTileLayer, useMap, useMapEvents } from "react-leaflet";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { RadarWeatherData, RadarWindGrid, VatsimStation } from "@/lib/radar-external";
import type { PublicRadarFlight, RadarLayers } from "@/components/PublicBaRadar";
import { BaRadarWindField } from "@/components/BaRadarWindField";
import { BAV_AIRPORT_RUNWAY_LIGHTS, type BAVAirportRunwayLight } from "@/data/bav-airport-runway-lights";
import { BAV_AIRPORT_LIGHT_INDEX } from "@/data/bav-airport-light-index";

type Position = [number, number];
type AirportSurfaceKind = "taxiway" | "apron";
type AirportSurfaceLighting = {
  code: string;
  surfaces: { kind: AirportSurfaceKind; points: Position[] }[];
  gates: Position[];
};

const airportSurfaceCache = new Map<string, AirportSurfaceLighting>();

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
    html: `<span class="ba-radar-leaflet-icon ${selected ? "selected" : ""} ${flight.connectionHealthy ? "connected" : "stale"}"><b style="--aircraft-heading:${heading}deg"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.1 1.4c.5-.7 1.3-.7 1.8 0L15.1 9l6.3 2.5v2l-6.2-.7-1.2 4.4 2.5 1.5v1.6L12 19.4l-4.5.9v-1.6l2.5-1.5-1.2-4.4-6.2.7v-2L8.9 9l2.2-7.6Z" /></svg></b><em>${escapeHtml(flight.flightNumber)}</em></span>`,
    iconSize: [58, 49],
    iconAnchor: [29, 24],
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

function useDarkTheme() {
  const [dark, setDark] = useState(() => typeof document !== "undefined" && document.documentElement.dataset.theme === "dark");
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.dataset.theme === "dark");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function translatePoint([latitude, longitude]: Position, eastMeters: number, northMeters: number): Position {
  return [
    latitude + northMeters / 110_540,
    longitude + eastMeters / (111_320 * Math.max(0.15, Math.cos(latitude * Math.PI / 180))),
  ];
}

function runwayEdges(runway: BAVAirportRunwayLight) {
  const [startLatitude, startLongitude] = runway.start;
  const [endLatitude, endLongitude] = runway.end;
  const meanLatitude = (startLatitude + endLatitude) / 2 * Math.PI / 180;
  const east = (endLongitude - startLongitude) * 111_320 * Math.cos(meanLatitude);
  const north = (endLatitude - startLatitude) * 110_540;
  const length = Math.hypot(east, north);
  if (length < 1) return null;
  const halfWidth = runway.widthM / 2;
  const leftEast = -north / length * halfWidth;
  const leftNorth = east / length * halfWidth;
  const start: Position = [startLatitude, startLongitude];
  const end: Position = [endLatitude, endLongitude];
  return {
    left: [translatePoint(start, leftEast, leftNorth), translatePoint(end, leftEast, leftNorth)] as Position[],
    right: [translatePoint(start, -leftEast, -leftNorth), translatePoint(end, -leftEast, -leftNorth)] as Position[],
    centre: [start, end] as Position[],
  };
}

function NightAirportLights() {
  const map = useMap();
  const darkTheme = useDarkTheme();
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }));
  useMapEvents({
    moveend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }),
  });

  // Aircraft lighting should appear only when a pilot is close enough to use it.
  // The visible-viewport filter keeps the all-airport data effectively free at world scale.
  if (!darkTheme || view.zoom < 11) return null;
  const bounds = view.bounds.pad(0.12);
  const visibleRunways = BAV_AIRPORT_RUNWAY_LIGHTS.filter((runway) => bounds.contains([runway.start[0], runway.start[1]]) || bounds.contains([runway.end[0], runway.end[1]]));

  return <>{visibleRunways.map((runway, index) => {
    const edges = runwayEdges(runway);
    if (!edges) return null;
    const key = `${runway.code}:${index}`;
    return <Fragment key={key}>
      <Polyline key={`${key}:glow`} positions={edges.centre} pathOptions={{ color: "#168fff", weight: 10, opacity: 0.16, interactive: false, className: "ba-radar-night-runway-glow" }} />
      <Polyline key={`${key}:left`} positions={edges.left} pathOptions={{ color: "#d6f2ff", weight: 1.8, opacity: 0.96, dashArray: "1 8", lineCap: "round", interactive: false, className: "ba-radar-night-runway-edge" }} />
      <Polyline key={`${key}:right`} positions={edges.right} pathOptions={{ color: "#d6f2ff", weight: 1.8, opacity: 0.96, dashArray: "1 8", lineCap: "round", interactive: false, className: "ba-radar-night-runway-edge" }} />
      <Polyline key={`${key}:centre`} positions={edges.centre} pathOptions={{ color: "#f8d95a", weight: 1.1, opacity: 0.82, dashArray: "4 13", lineCap: "round", interactive: false, className: "ba-radar-night-runway-centre" }} />
    </Fragment>;
  })}</>;
}

function isPosition(value: unknown): value is Position {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === "number"
    && typeof value[1] === "number"
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

function readAirportSurfaceLighting(value: unknown): AirportSurfaceLighting | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || !Array.isArray(record.surfaces) || !Array.isArray(record.gates)) return null;

  const surfaces = record.surfaces.flatMap((surface) => {
    if (!surface || typeof surface !== "object") return [];
    const candidate = surface as Record<string, unknown>;
    const kind: AirportSurfaceKind | null = candidate.kind === "taxiway" || candidate.kind === "apron" ? candidate.kind : null;
    if (!kind || !Array.isArray(candidate.points)) return [];
    const points = candidate.points.filter(isPosition);
    return points.length >= 2 ? [{ kind, points }] : [];
  });

  return { code: record.code, surfaces, gates: record.gates.filter(isPosition) };
}

async function loadAirportSurfaceLighting(code: string) {
  const cached = airportSurfaceCache.get(code);
  if (cached) return cached;
  const response = await fetch(`/airport-lights/${code}.json`, { cache: "force-cache" });
  if (!response.ok) return null;
  const parsed = readAirportSurfaceLighting(await response.json());
  if (parsed) airportSurfaceCache.set(code, parsed);
  return parsed;
}

function NightAirportSurfaceLights() {
  const map = useMap();
  const darkTheme = useDarkTheme();
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }));
  const [airportLighting, setAirportLighting] = useState({ key: "", airports: [] as AirportSurfaceLighting[] });
  useMapEvents({
    moveend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }),
  });

  // Keep airport geometry out of the normal map experience: at most two nearby
  // airports are fetched, and only once a pilot is at an airport-operating zoom.
  const candidateCodes = useMemo(() => {
    if (!darkTheme || view.zoom < 13) return [];
    const visibleBounds = view.bounds.pad(0.18);
    return BAV_AIRPORT_LIGHT_INDEX
      .filter((airport) => visibleBounds.intersects(L.latLngBounds(
        [airport.bounds[0], airport.bounds[1]],
        [airport.bounds[2], airport.bounds[3]],
      )))
      .slice(0, 2)
      .map((airport) => airport.code);
  }, [darkTheme, view]);
  const candidateKey = candidateCodes.join("|");

  useEffect(() => {
    let cancelled = false;
    if (!darkTheme || view.zoom < 13 || !candidateCodes.length) {
      return () => { cancelled = true; };
    }
    void Promise.all(candidateCodes.map(loadAirportSurfaceLighting)).then((loaded) => {
      if (!cancelled) setAirportLighting({ key: candidateKey, airports: loaded.filter((airport): airport is AirportSurfaceLighting => airport !== null) });
    }).catch(() => {
      if (!cancelled) setAirportLighting({ key: candidateKey, airports: [] });
    });
    return () => { cancelled = true; };
  }, [candidateKey, candidateCodes, darkTheme, view.zoom]);

  // Loading is asynchronous. Do not draw a previous airport's lights while a
  // pilot is moving between airports or switching out of the close-up view.
  const visibleAirportLighting = airportLighting.key === candidateKey ? airportLighting.airports : [];

  const surfaceFeatures = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: visibleAirportLighting.flatMap((airport) => airport.surfaces.slice(0, 850).map((surface) => ({
      type: "Feature" as const,
      properties: { kind: surface.kind },
      geometry: {
        type: "LineString" as const,
        coordinates: surface.points.map(([latitude, longitude]) => [longitude, latitude]),
      },
    }))),
  }), [visibleAirportLighting]);
  const gateFeatures = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: visibleAirportLighting.flatMap((airport) => airport.gates.slice(0, 420).map(([latitude, longitude]) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Point" as const, coordinates: [longitude, latitude] },
    }))),
  }), [visibleAirportLighting]);

  if (!darkTheme || view.zoom < 13 || (!surfaceFeatures.features.length && !gateFeatures.features.length)) return null;

  return <>
    {surfaceFeatures.features.length ? <>
      <GeoJSON
        data={surfaceFeatures as never}
        style={(feature) => feature?.properties?.kind === "taxiway"
          ? { color: "#178fff", weight: 9, opacity: 0.16, interactive: false, className: "ba-radar-night-taxi-glow" }
          : { color: "#e8a04b", weight: 7, opacity: 0.1, interactive: false, className: "ba-radar-night-apron-glow" }}
      />
      <GeoJSON
        data={surfaceFeatures as never}
        style={(feature) => feature?.properties?.kind === "taxiway"
          ? { color: "#50b6ff", weight: 1.65, opacity: 0.9, dashArray: "1 8", lineCap: "round", interactive: false, className: "ba-radar-night-taxi-light" }
          : { color: "#e5ad62", weight: 1, opacity: 0.55, dashArray: "1 10", lineCap: "round", interactive: false, className: "ba-radar-night-apron-light" }}
      />
    </> : null}
    {gateFeatures.features.length ? <GeoJSON
      data={gateFeatures as never}
      pointToLayer={(_feature, latitudeLongitude) => L.circleMarker(latitudeLongitude, {
        radius: 2.1,
        color: "#ffe1a6",
        weight: 0.8,
        opacity: 0.95,
        fillColor: "#f5a142",
        fillOpacity: 0.9,
        interactive: false,
        className: "ba-radar-night-gate-light",
      })}
    /> : null}
  </>;
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
    <NightAirportLights />
    <NightAirportSurfaceLights />
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
}) {
  const positioned = flights.filter((flight) => flight.lastSnapshot);
  const selected = positioned.find((flight) => flight.id === selectedId) ?? null;
  const trail: Position[] = (selected?.recentSnapshots ?? [])
    .filter((snapshot) => Number.isFinite(snapshot.latitude) && Number.isFinite(snapshot.longitude))
    .map((snapshot) => [snapshot.latitude, snapshot.longitude]);

  return <MapContainer className="ba-radar-leaflet-map" center={[27, -13]} zoom={2} minZoom={2} maxZoom={19} worldCopyJump scrollWheelZoom>
    <TileLayer
      className="ba-radar-base-tiles"
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
      maxNativeZoom={19}
      maxZoom={19}
    />
    <MapLayers controllers={controllers} weather={weather} windGrid={windGrid} onWindRendererStatus={onWindRendererStatus} layers={layers} selectedController={selectedController} onSelectController={onSelectController} />
    {trail.length > 1 ? <Polyline positions={trail} pathOptions={{ color: "#e9ba2f", weight: 3, opacity: 0.9 }} /> : null}
    {positioned.map((flight) => <Marker key={flight.id} position={[flight.lastSnapshot!.latitude, flight.lastSnapshot!.longitude]} icon={aircraftIcon(flight, flight.id === selectedId)} eventHandlers={{ click: () => onSelect(flight.id) }} />)}
  </MapContainer>;
}
