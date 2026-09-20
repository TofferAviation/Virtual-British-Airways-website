"use client";

import L from "leaflet";
import { GeoJSON, MapContainer, Marker, Pane, Polyline, TileLayer, WMSTileLayer, useMap, useMapEvents } from "react-leaflet";
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

function distanceMeters(a: Position, b: Position) {
  const meanLatitude = (a[0] + b[0]) / 2 * Math.PI / 180;
  const east = (b[1] - a[1]) * 111_320 * Math.cos(meanLatitude);
  const north = (b[0] - a[0]) * 110_540;
  return Math.hypot(east, north);
}

function polylineLengthMeters(points: Position[]) {
  return points.slice(1).reduce((total, point, index) => total + distanceMeters(points[index], point), 0);
}

function interpolatePoint(a: Position, b: Position, ratio: number): Position {
  return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
}

function trimPolyline(points: Position[], trimMeters: number) {
  const totalLength = polylineLengthMeters(points);
  if (totalLength <= trimMeters * 2 + 24) return [] as Position[];
  const endDistance = totalLength - trimMeters;
  const trimmed: Position[] = [];
  let travelled = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = distanceMeters(start, end);
    const segmentEnd = travelled + length;
    if (length < 0.01 || segmentEnd < trimMeters) {
      travelled = segmentEnd;
      continue;
    }

    const from = Math.max(0, (trimMeters - travelled) / length);
    const to = Math.min(1, (endDistance - travelled) / length);
    if (from <= to) {
      if (!trimmed.length) trimmed.push(interpolatePoint(start, end, from));
      if (to < 1) {
        trimmed.push(interpolatePoint(start, end, to));
        return trimmed;
      }
      trimmed.push(end);
    }
    travelled = segmentEnd;
  }
  return trimmed;
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
  const runwayEast = east / length;
  const runwayNorth = north / length;
  const approachLine = (origin: Position, direction: 1 | -1) => Array.from(
    { length: 7 },
    (_, index) => translatePoint(origin, runwayEast * direction * (450 - index * 75), runwayNorth * direction * (450 - index * 75)),
  );
  return {
    left: [translatePoint(start, leftEast, leftNorth), translatePoint(end, leftEast, leftNorth)] as Position[],
    right: [translatePoint(start, -leftEast, -leftNorth), translatePoint(end, -leftEast, -leftNorth)] as Position[],
    centre: [start, end] as Position[],
    startThreshold: [translatePoint(start, leftEast, leftNorth), translatePoint(start, -leftEast, -leftNorth)] as Position[],
    endThreshold: [translatePoint(end, leftEast, leftNorth), translatePoint(end, -leftEast, -leftNorth)] as Position[],
    startApproach: approachLine(start, -1),
    endApproach: approachLine(end, 1),
  };
}

function taxiwayEdges(points: Position[], halfWidthM = 10.5) {
  // Edge lighting stops before the marked junction area rather than carrying
  // every independent OSM way into the same intersection.
  const trimmedPoints = trimPolyline(points, 26);
  if (trimmedPoints.length < 2) return null;
  const offset = (point: Position, previous: Position, next: Position, side: 1 | -1) => {
    const meanLatitude = (previous[0] + next[0]) / 2 * Math.PI / 180;
    const east = (next[1] - previous[1]) * 111_320 * Math.cos(meanLatitude);
    const north = (next[0] - previous[0]) * 110_540;
    const length = Math.hypot(east, north);
    if (length < 0.1) return point;
    return translatePoint(point, -north / length * halfWidthM * side, east / length * halfWidthM * side);
  };
  return {
    left: trimmedPoints.map((point, index) => offset(point, trimmedPoints[Math.max(0, index - 1)], trimmedPoints[Math.min(trimmedPoints.length - 1, index + 1)], 1)),
    right: trimmedPoints.map((point, index) => offset(point, trimmedPoints[Math.max(0, index - 1)], trimmedPoints[Math.min(trimmedPoints.length - 1, index + 1)], -1)),
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
      <Polyline key={`${key}:glow`} positions={edges.centre} pathOptions={{ color: "#168fff", weight: 7, opacity: 0.08, interactive: false, className: "ba-radar-night-runway-glow" }} />
      <Polyline key={`${key}:left`} positions={edges.left} pathOptions={{ color: "#d6f2ff", weight: 1.25, opacity: 0.9, dashArray: "1 12", lineCap: "round", interactive: false, className: "ba-radar-night-runway-edge" }} />
      <Polyline key={`${key}:right`} positions={edges.right} pathOptions={{ color: "#d6f2ff", weight: 1.25, opacity: 0.9, dashArray: "1 12", lineCap: "round", interactive: false, className: "ba-radar-night-runway-edge" }} />
      <Polyline key={`${key}:centre`} positions={edges.centre} pathOptions={{ color: "#f8d95a", weight: 1, opacity: 0.68, dashArray: "2 19", lineCap: "round", interactive: false, className: "ba-radar-night-runway-centre" }} />
      <Polyline key={`${key}:start-approach`} positions={edges.startApproach} pathOptions={{ color: "#f6fbff", weight: 1, opacity: 0.86, dashArray: "1 18", lineCap: "round", interactive: false, className: "ba-radar-night-approach-light" }} />
      <Polyline key={`${key}:end-approach`} positions={edges.endApproach} pathOptions={{ color: "#f6fbff", weight: 1, opacity: 0.86, dashArray: "1 18", lineCap: "round", interactive: false, className: "ba-radar-night-approach-light" }} />
      <Polyline key={`${key}:start-threshold`} positions={edges.startThreshold} pathOptions={{ color: "#66f7a5", weight: 1.5, opacity: 0.9, dashArray: "1 10", lineCap: "round", interactive: false, className: "ba-radar-night-threshold-light" }} />
      <Polyline key={`${key}:end-threshold`} positions={edges.endThreshold} pathOptions={{ color: "#ff666d", weight: 1.5, opacity: 0.9, dashArray: "1 10", lineCap: "round", interactive: false, className: "ba-radar-night-end-light" }} />
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
  const visibleAirportLighting = useMemo(
    () => airportLighting.key === candidateKey ? airportLighting.airports : [],
    [airportLighting, candidateKey],
  );

  const taxiwayEdgeFeatures = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: visibleAirportLighting.flatMap((airport) => airport.surfaces
      .filter((surface) => surface.kind === "taxiway")
      // The OSM surface feed has short connector fragments at every junction.
      // Those are not edge-lit runs and made a dense blue mesh at large airports.
      .filter((surface) => polylineLengthMeters(surface.points) >= 110)
      .slice(0, 260)
      .flatMap((surface) => {
        const edges = taxiwayEdges(surface.points);
        if (!edges) return [];
        return [edges.left, edges.right].map((edge) => ({
          type: "Feature" as const,
          properties: {},
          geometry: { type: "LineString" as const, coordinates: edge.map(([latitude, longitude]) => [longitude, latitude]) },
        }));
      })),
  }), [visibleAirportLighting]);
  const apronFeatures = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: visibleAirportLighting.flatMap((airport) => airport.surfaces
      .filter((surface) => surface.kind === "apron")
      .slice(0, 180)
      .map((surface) => ({
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates: surface.points.map(([latitude, longitude]) => [longitude, latitude]) },
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

  if (!darkTheme || view.zoom < 13 || (!taxiwayEdgeFeatures.features.length && !apronFeatures.features.length && !gateFeatures.features.length)) return null;

  return <>
    {taxiwayEdgeFeatures.features.length ? <>
      <GeoJSON
        data={taxiwayEdgeFeatures as never}
        style={{ color: "#178fff", weight: 3, opacity: 0.045, interactive: false, className: "ba-radar-night-taxi-glow" }}
      />
      <GeoJSON
        data={taxiwayEdgeFeatures as never}
        style={{ color: "#58b9ff", weight: 0.8, opacity: 0.76, dashArray: "1 22", lineCap: "round", interactive: false, className: "ba-radar-night-taxi-light" }}
      />
    </> : null}
    {apronFeatures.features.length ? <>
      <GeoJSON data={apronFeatures as never} style={{ color: "#e8a04b", weight: 4, opacity: 0.06, interactive: false, className: "ba-radar-night-apron-glow" }} />
      <GeoJSON data={apronFeatures as never} style={{ color: "#e5ad62", weight: 0.75, opacity: 0.42, dashArray: "1 11", lineCap: "round", interactive: false, className: "ba-radar-night-apron-light" }} />
    </> : null}
    {gateFeatures.features.length ? <GeoJSON
      data={gateFeatures as never}
      pointToLayer={(_feature, latitudeLongitude) => L.circleMarker(latitudeLongitude, {
        radius: 1.15,
        color: "#ffe1a6",
        weight: 0.8,
        opacity: 0.95,
        fillColor: "#f5a142",
        fillOpacity: 0.72,
        interactive: false,
        className: "ba-radar-night-gate-light",
      })}
    /> : null}
  </>;
}

type AirportGeometryFeature = {
  type: "Feature";
  properties: { aeroway?: string; ref?: string | null; width?: string | null };
  geometry: { type: "LineString" | "Polygon" | "Point"; coordinates: unknown };
};

type AirportGeometry = {
  type: "FeatureCollection";
  metadata?: { bounds?: { south?: number; west?: number; north?: number; east?: number } };
  features: AirportGeometryFeature[];
};

function readAirportGeometry(value: unknown): AirportGeometry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type !== "FeatureCollection" || !Array.isArray(record.features)) return null;
  const features = record.features.flatMap((feature) => {
    if (!feature || typeof feature !== "object") return [];
    const candidate = feature as Record<string, unknown>;
    const properties = candidate.properties;
    const geometry = candidate.geometry;
    if (!properties || typeof properties !== "object" || !geometry || typeof geometry !== "object") return [];
    const geometryRecord = geometry as Record<string, unknown>;
    const aeroway = (properties as Record<string, unknown>).aeroway;
    const type = geometryRecord.type;
    if (typeof aeroway !== "string" || (type !== "LineString" && type !== "Polygon" && type !== "Point")) return [];
    const geometryType = type as AirportGeometryFeature["geometry"]["type"];
    const sourceProperties = properties as Record<string, unknown>;
    return [{
      type: "Feature" as const,
      properties: {
        aeroway,
        ref: typeof sourceProperties.ref === "string" ? sourceProperties.ref : null,
        width: typeof sourceProperties.width === "string" ? sourceProperties.width : null,
      },
      geometry: { type: geometryType, coordinates: geometryRecord.coordinates },
    }];
  });
  return { type: "FeatureCollection", metadata: record.metadata as AirportGeometry["metadata"], features };
}

let egllGeometryRequest: Promise<AirportGeometry | null> | null = null;

function loadEgllGeometry() {
  if (!egllGeometryRequest) {
    egllGeometryRequest = fetch("/airport-geometry/EGLL.geojson", { cache: "force-cache" })
      .then((response) => response.ok ? response.json() : null)
      .then(readAirportGeometry)
      .catch(() => null);
  }
  return egllGeometryRequest;
}

function useAirportDebugMode() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const sync = () => setEnabled(new URLSearchParams(window.location.search).get("airportDebug") === "true");
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return enabled;
}

function lineCoordinates(geometry: AirportGeometryFeature["geometry"]) {
  if (geometry.type !== "LineString" || !Array.isArray(geometry.coordinates)) return [] as Position[];
  return geometry.coordinates.flatMap((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length !== 2 || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) return [];
    return [[coordinate[1], coordinate[0]] as Position];
  });
}

function sampleLinePositions(points: Position[], spacingMeters = 90) {
  const samples: Position[] = [];
  let travelled = 0;
  let nextSample = spacingMeters;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = distanceMeters(start, end);
    while (length > 0 && travelled + length >= nextSample) {
      samples.push(interpolatePoint(start, end, (nextSample - travelled) / length));
      nextSample += spacingMeters;
    }
    travelled += length;
  }
  return samples;
}

/**
 * Development-only projection check. The data is a committed OSM snapshot, so
 * this has no live external dependency and Leaflet performs the projection.
 */
function AirportGeometryDebug() {
  const map = useMap();
  const debugMode = useAirportDebugMode();
  const [geometry, setGeometry] = useState<AirportGeometry | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!debugMode) return () => { cancelled = true; };
    void loadEgllGeometry()
      .then((value) => {
        if (!cancelled) setGeometry(readAirportGeometry(value));
      })
      .catch(() => {
        if (!cancelled) setGeometry(null);
      });
    return () => { cancelled = true; };
  }, [debugMode]);

  useEffect(() => {
    const bounds = geometry?.metadata?.bounds;
    const { south, west, north, east } = bounds ?? {};
    if (!debugMode || typeof south !== "number" || typeof west !== "number" || typeof north !== "number" || typeof east !== "number") return;
    map.fitBounds([[south, west], [north, east]], { animate: false, padding: [46, 46], maxZoom: 15 });
  }, [debugMode, geometry, map]);

  const visualGeometry = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: geometry?.features.filter((feature) => ["runway", "taxiway", "apron"].includes(feature.properties.aeroway ?? "")) ?? [],
  }), [geometry]);
  const samplePoints = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: (geometry?.features ?? []).flatMap((feature) => {
      if (feature.properties.aeroway !== "taxiway") return [];
      return sampleLinePositions(lineCoordinates(feature.geometry)).map(([latitude, longitude]) => ({
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Point" as const, coordinates: [longitude, latitude] },
      }));
    }),
  }), [geometry]);

  if (!debugMode || !geometry) return null;
  return <>
    <GeoJSON
      data={visualGeometry as never}
      style={(feature) => {
        const aeroway = feature?.properties?.aeroway;
        if (aeroway === "runway") return { color: "#ff3441", weight: 4, opacity: 0.96, interactive: false };
        if (aeroway === "taxiway") return { color: "#45ff7d", weight: 1.3, opacity: 0.94, interactive: false };
        return { color: "#ffe35b", weight: 1, opacity: 0.82, fillColor: "#ffe35b", fillOpacity: 0.18, interactive: false };
      }}
    />
    <GeoJSON
      data={samplePoints as never}
      pointToLayer={(_feature, latitudeLongitude) => L.circleMarker(latitudeLongitude, {
        radius: 1.25,
        color: "#ffffff",
        weight: 0.6,
        opacity: 0.96,
        fillColor: "#ffffff",
        fillOpacity: 0.92,
        interactive: false,
      })}
    />
  </>;
}

type LinearSample = { position: Position; east: number; north: number };

function sampledLineWithTangent(points: Position[], spacingMeters: number): LinearSample[] {
  return sampledLineWithTerminalLights(points, spacingMeters, false);
}

/**
 * The points stay anchored to the OSM centreline.  Taxiways are commonly
 * stored as several short ways, so retaining each terminal avoids visibly
 * unlit joins without ever drawing a synthetic screen-space grid.
 */
function sampledLineWithTerminalLights(points: Position[], spacingMeters: number, includeTerminals: boolean): LinearSample[] {
  const samples: LinearSample[] = [];
  if (points.length < 2) return samples;

  const tangentAt = (from: Position, toward: Position): LinearSample | null => {
    const meanLatitude = (from[0] + toward[0]) / 2 * Math.PI / 180;
    const east = (toward[1] - from[1]) * 111_320 * Math.cos(meanLatitude);
    const north = (toward[0] - from[0]) * 110_540;
    return Math.hypot(east, north) > 0.1 ? { position: from, east, north } : null;
  };

  if (includeTerminals) {
    const firstTangent = tangentAt(points[0], points[1]);
    if (firstTangent) samples.push(firstTangent);
  }
  let travelled = 0;
  let nextSample = spacingMeters;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const meanLatitude = (start[0] + end[0]) / 2 * Math.PI / 180;
    const east = (end[1] - start[1]) * 111_320 * Math.cos(meanLatitude);
    const north = (end[0] - start[0]) * 110_540;
    const length = Math.hypot(east, north);
    while (length > 0 && travelled + length >= nextSample) {
      samples.push({ position: interpolatePoint(start, end, (nextSample - travelled) / length), east, north });
      nextSample += spacingMeters;
    }
    travelled += length;
  }
  if (includeTerminals) {
    const lastTangent = tangentAt(points.at(-1) as Position, points.at(-2) as Position);
    if (lastTangent) samples.push(lastTangent);
  }
  return samples;
}

function offsetFromCentreline(sample: LinearSample, perpendicularMeters: number) {
  const length = Math.hypot(sample.east, sample.north);
  if (length < 0.1) return sample.position;
  return translatePoint(sample.position, -sample.north / length * perpendicularMeters, sample.east / length * perpendicularMeters);
}

function runwayThresholdPoints(points: Position[], widthMeters: number, atStart: boolean) {
  const from = atStart ? points[0] : points.at(-1);
  const toward = atStart ? points[1] : points.at(-2);
  if (!from || !toward) return [] as Position[];
  const meanLatitude = (from[0] + toward[0]) / 2 * Math.PI / 180;
  const east = (toward[1] - from[1]) * 111_320 * Math.cos(meanLatitude);
  const north = (toward[0] - from[0]) * 110_540;
  const divisions = Math.max(5, Math.round(widthMeters / 5) + 1);
  return Array.from({ length: divisions }, (_, index) => {
    const offset = -widthMeters / 2 + widthMeters * index / (divisions - 1);
    return offsetFromCentreline({ position: from, east, north }, offset);
  });
}

function polygonPoints(geometry: AirportGeometryFeature["geometry"]) {
  if (geometry.type !== "Polygon" || !Array.isArray(geometry.coordinates) || !Array.isArray(geometry.coordinates[0])) return [] as Position[];
  return geometry.coordinates[0].flatMap((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length !== 2 || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) return [];
    return [[coordinate[1], coordinate[0]] as Position];
  });
}

function polygonAreaMeters(points: Position[]) {
  if (points.length < 4) return 0;
  const latitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const longitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const scaleLongitude = 111_320 * Math.cos(latitude * Math.PI / 180);
  let twiceArea = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    twiceArea += ((a[1] - longitude) * scaleLongitude) * ((b[0] - latitude) * 110_540)
      - ((b[1] - longitude) * scaleLongitude) * ((a[0] - latitude) * 110_540);
  }
  return Math.abs(twiceArea) / 2;
}

function polygonCentroid(points: Position[]) {
  const unique = points.length > 1 ? points.slice(0, -1) : points;
  return unique.reduce<Position>((total, point) => [total[0] + point[0] / unique.length, total[1] + point[1] / unique.length], [0, 0]);
}

function pointCoordinates(geometry: AirportGeometryFeature["geometry"]) {
  if (geometry.type !== "Point" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 2) return null;
  const [longitude, latitude] = geometry.coordinates;
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] as Position : null;
}

function pointFeature([latitude, longitude]: Position) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Point" as const, coordinates: [longitude, latitude] },
  };
}

/**
 * Actual OSM geometry -> cached sampled light positions -> a shared Leaflet
 * canvas. There are no inferred screen paths or generated road-style lines.
 */
function OsmAirportNightLights() {
  const map = useMap();
  const darkTheme = useDarkTheme();
  const debugMode = useAirportDebugMode();
  const [view, setView] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }));
  const [geometry, setGeometry] = useState<AirportGeometry | null>(null);
  const renderer = useMemo(() => L.canvas({ padding: 0.2 }), []);
  useMapEvents({
    moveend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }),
    zoomend: () => setView({ zoom: map.getZoom(), bounds: map.getBounds() }),
  });

  const nearHeathrow = view.zoom >= 13 && view.bounds.pad(0.16).intersects(L.latLngBounds([51.455, -0.502], [51.48, -0.415]));
  useEffect(() => {
    let cancelled = false;
    if (!nearHeathrow) return () => { cancelled = true; };
    void loadEgllGeometry().then((value) => {
      if (!cancelled) setGeometry(value);
    });
    return () => { cancelled = true; };
  }, [nearHeathrow]);

  const lightData = useMemo(() => {
    const taxiwayEdgeSamples: Position[] = [];
    const taxiwayCentreSamples: Position[] = [];
    const runwayCentreSamples: Position[] = [];
    const runwayEdgeSamples: Position[] = [];
    const thresholdSamples: Position[] = [];
    const endSamples: Position[] = [];
    const largeAprons: { centre: Position; area: number }[] = [];
    const gatePositions: Position[] = [];

    for (const feature of geometry?.features ?? []) {
      const points = lineCoordinates(feature.geometry);
      if (feature.properties.aeroway === "taxiway") {
        // Blue edge lights are sampled from each actual taxiway centreline and
        // its recorded width where available. A conservative 20 m default
        // keeps the lighting inside a normal taxiway rather than on roads.
        const width = Math.max(12, Math.min(36, Number(feature.properties.width) || 20));
        const edgeSamples = sampledLineWithTerminalLights(points, 32, true);
        taxiwayEdgeSamples.push(...edgeSamples.flatMap((sample) => [
          offsetFromCentreline(sample, width / 2),
          offsetFromCentreline(sample, -width / 2),
        ]));
        taxiwayCentreSamples.push(...sampledLineWithTangent(points, 64).map((sample) => sample.position));
      }
      if (feature.properties.aeroway === "runway" && /^(09L\/27R|09R\/27L)$/.test(feature.properties.ref ?? "")) {
        const width = Math.max(30, Math.min(70, Number(feature.properties.width) || 45));
        const centreSamples = sampledLineWithTangent(points, 30);
        runwayCentreSamples.push(...centreSamples.map((sample) => sample.position));
        runwayEdgeSamples.push(...sampledLineWithTangent(points, 60).flatMap((sample) => [
          offsetFromCentreline(sample, width / 2),
          offsetFromCentreline(sample, -width / 2),
        ]));
        thresholdSamples.push(...runwayThresholdPoints(points, width, true));
        endSamples.push(...runwayThresholdPoints(points, width, false));
      }
      if (feature.properties.aeroway === "apron") {
        const points = polygonPoints(feature.geometry);
        const area = polygonAreaMeters(points);
        if (area >= 8_000) largeAprons.push({ centre: polygonCentroid(points), area });
      }
      if (feature.properties.aeroway === "gate") {
        const position = pointCoordinates(feature.geometry);
        if (position) gatePositions.push(position);
      }
    }

    // One source per well-separated, major OSM apron: broad mast illumination,
    // not a repeated grid of decorative points.
    const apronFloodlights = largeAprons
      .sort((a, b) => b.area - a.area)
      .reduce<Position[]>((selected, apron) => selected.length >= 12 || selected.some((centre) => distanceMeters(centre, apron.centre) < 240)
        ? selected
        : [...selected, apron.centre], []);

    return {
      taxiwayEdges: { type: "FeatureCollection" as const, features: taxiwayEdgeSamples.map(pointFeature) },
      taxiwayCentres: { type: "FeatureCollection" as const, features: taxiwayCentreSamples.map(pointFeature) },
      runwayCentres: { type: "FeatureCollection" as const, features: runwayCentreSamples.map(pointFeature) },
      runwayEdges: { type: "FeatureCollection" as const, features: runwayEdgeSamples.map(pointFeature) },
      thresholds: { type: "FeatureCollection" as const, features: thresholdSamples.map(pointFeature) },
      ends: { type: "FeatureCollection" as const, features: endSamples.map(pointFeature) },
      aprons: { type: "FeatureCollection" as const, features: apronFloodlights.map(pointFeature) },
      gates: { type: "FeatureCollection" as const, features: gatePositions.map(pointFeature) },
    };
  }, [geometry]);

  if (!nearHeathrow || !geometry || debugMode) return null;
  return <Pane name="bav-osm-night-lights" className="ba-radar-osm-night-lights" style={{ opacity: darkTheme ? 1 : 0, transition: "opacity 700ms ease", pointerEvents: "none" }}>
    <GeoJSON
      data={lightData.taxiwayEdges as never}
      pointToLayer={(_feature, latitudeLongitude) => L.circleMarker(latitudeLongitude, {
        renderer, radius: 2.35, color: "#3eb7ff", weight: 0, opacity: 0, fillColor: "#178fe5", fillOpacity: 0.1, interactive: false,
      })}
    />
    <GeoJSON
      data={lightData.taxiwayEdges as never}
      pointToLayer={(_feature, latitudeLongitude) => L.circleMarker(latitudeLongitude, {
        renderer, radius: 0.9, color: "#b8ebff", weight: 0.25, opacity: 0.94, fillColor: "#299deb", fillOpacity: 0.94, interactive: false, className: "ba-radar-osm-taxiway-light",
      })}
    />
    <GeoJSON
      data={lightData.taxiwayCentres as never}
      pointToLayer={(_feature, latitudeLongitude) => L.circleMarker(latitudeLongitude, {
        renderer, radius: 0.7, color: "#74ffb1", weight: 0, opacity: 0, fillColor: "#53dd95", fillOpacity: 0.72, interactive: false,
      })}
    />
    <GeoJSON
      data={lightData.runwayEdges as never}
      pointToLayer={(_feature, latitudeLongitude) => L.circleMarker(latitudeLongitude, {
        renderer, radius: 1.25, color: "#e8f7ff", weight: 0.5, opacity: 0.88, fillColor: "#d8f1ff", fillOpacity: 0.88, interactive: false, className: "ba-radar-osm-runway-light",
      })}
    />
    <GeoJSON
      data={lightData.runwayCentres as never}
      pointToLayer={(_feature, latitudeLongitude) => L.circleMarker(latitudeLongitude, {
        renderer, radius: 1.05, color: "#ffffff", weight: 0.45, opacity: 0.9, fillColor: "#f8fbff", fillOpacity: 0.9, interactive: false, className: "ba-radar-osm-runway-light",
      })}
    />
    <GeoJSON
      data={lightData.thresholds as never}
      pointToLayer={(_feature, latitudeLongitude) => L.circleMarker(latitudeLongitude, {
        renderer, radius: 1.45, color: "#91ffbd", weight: 0.6, opacity: 0.92, fillColor: "#58e994", fillOpacity: 0.9, interactive: false, className: "ba-radar-osm-threshold-light",
      })}
    />
    <GeoJSON
      data={lightData.ends as never}
      pointToLayer={(_feature, latitudeLongitude) => L.circleMarker(latitudeLongitude, {
        renderer, radius: 1.45, color: "#ff9c9c", weight: 0.6, opacity: 0.92, fillColor: "#ea5f62", fillOpacity: 0.9, interactive: false, className: "ba-radar-osm-end-light",
      })}
    />
    <GeoJSON
      data={lightData.aprons as never}
      pointToLayer={(_feature, latitudeLongitude) => L.circleMarker(latitudeLongitude, {
        renderer, radius: 22, color: "#ffcf80", weight: 0, opacity: 0, fillColor: "#f4a44f", fillOpacity: 0.12, interactive: false, className: "ba-radar-osm-apron-light",
      })}
    />
    <GeoJSON
      data={lightData.gates as never}
      pointToLayer={(_feature, latitudeLongitude) => L.circleMarker(latitudeLongitude, {
        renderer, radius: 6, color: "#ffc66d", weight: 0, opacity: 0, fillColor: "#f4a44f", fillOpacity: 0.16, interactive: false,
      })}
    />
    <GeoJSON
      data={lightData.gates as never}
      pointToLayer={(_feature, latitudeLongitude) => L.circleMarker(latitudeLongitude, {
        renderer, radius: 1.35, color: "#ffe0a5", weight: 0.35, opacity: 0.9, fillColor: "#f5ad4d", fillOpacity: 0.94, interactive: false, className: "ba-radar-osm-gate-light",
      })}
    />
  </Pane>;
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
    <OsmAirportNightLights />
    <AirportGeometryDebug />
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
