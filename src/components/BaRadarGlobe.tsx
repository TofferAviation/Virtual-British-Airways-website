"use client";

import { useEffect, useMemo, useRef } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { RadarAuroraData, VatsimStation } from "@/lib/radar-external";
import type { PublicRadarFlight } from "@/lib/radar-live";

type GlobeReplay = { id: string; points: Array<{ latitude: number; longitude: number; headingDeg: number }>; activeIndex: number } | null;
export type GlobeCamera = { center: [number, number]; zoom: number; bearing: number; pitch: number };

type GeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] } | { type: "LineString"; coordinates: Array<[number, number]> };
    properties: Record<string, string | number | boolean>;
  }>;
};

const emptyCollection: GeoJson = { type: "FeatureCollection", features: [] };

function validPoint(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

const auroraNorth = 84.8;
const auroraCoordinates: [[number, number], [number, number], [number, number], [number, number]] = [
  [-179.9, auroraNorth], [179.9, auroraNorth], [179.9, 45], [-179.9, 45],
];
const transparentImage = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

type GlobeImageSource = {
  updateImage: (input: { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] }) => void;
};

function auroraColour(probability: number) {
  if (probability < 10) return [48, 151, 212, 0.09] as const;
  if (probability < 15) return [56, 208, 184, 0.18] as const;
  if (probability < 30) return [83, 239, 145, 0.35] as const;
  if (probability < 50) return [132, 246, 117, 0.48] as const;
  if (probability < 70) return [180, 249, 108, 0.62] as const;
  return [209, 126, 255, 0.74] as const;
}

function auroraTexture(data: RadarAuroraData | null, blur: number, strength: number) {
  if (!data?.samples.length || typeof document === "undefined") return transparentImage;
  const west = -180;
  const south = 45;
  const field = document.createElement("canvas");
  field.width = 720;
  field.height = 180;
  const fieldContext = field.getContext("2d");
  const canvas = document.createElement("canvas");
  canvas.width = 1440;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  if (!fieldContext || !context) return transparentImage;

  for (const sample of data.samples) {
    // Image sources cannot touch Web Mercator's ±180° / 90° bounds.  The
    // actual auroral oval is well below 85° for the operational forecast.
    if (sample.latitude > auroraNorth) continue;
    const longitude = sample.longitude > 180 ? sample.longitude - 360 : sample.longitude;
    const x = Math.round((longitude - west) / 360 * field.width);
    const y = Math.round((auroraNorth - sample.latitude) / (auroraNorth - south) * field.height);
    const [red, green, blue, alpha] = auroraColour(sample.probability);
    fieldContext.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    fieldContext.fillRect(x - 2, y - 3, 5, 7);
  }

  context.imageSmoothingEnabled = true;
  context.globalCompositeOperation = "lighter";
  context.filter = `blur(${blur}px)`;
  context.globalAlpha = strength;
  context.drawImage(field, 0, 0, field.width, field.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function updateAuroraSurface(map: MapLibreMap, id: string, data: RadarAuroraData | null, blur: number, strength: number) {
  const source = map.getSource(id) as unknown as GlobeImageSource | undefined;
  source?.updateImage({ url: auroraTexture(data, blur, strength), coordinates: auroraCoordinates });
}

type AuroraCurtain = { longitude: number; latitude: number; probability: number; phase: number };

function auroraCurtains(data: RadarAuroraData | null): AuroraCurtain[] {
  if (!data?.samples.length) return [];
  // The forecast is a probability field, not an optical photograph. We keep
  // its actual position and strength, then use it as the anchor for a smooth
  // light curtain between five-minute NOAA updates.
  const bucketWidth = 1.5;
  const buckets = new Map<number, { latitudeTotal: number; weight: number; peak: number }>();
  for (const sample of data.samples) {
    if (sample.latitude > auroraNorth || sample.probability < 6) continue;
    const longitude = sample.longitude > 180 ? sample.longitude - 360 : sample.longitude;
    const key = Math.max(0, Math.min(239, Math.floor((longitude + 180) / bucketWidth)));
    const current = buckets.get(key) ?? { latitudeTotal: 0, weight: 0, peak: 0 };
    const weight = sample.probability * sample.probability;
    current.latitudeTotal += sample.latitude * weight;
    current.weight += weight;
    current.peak = Math.max(current.peak, sample.probability);
    buckets.set(key, current);
  }
  return [...buckets.entries()].flatMap(([key, bucket]) => {
    if (!bucket.weight || bucket.peak < 6) return [];
    const latitude = bucket.latitudeTotal / bucket.weight;
    const seam = (Math.sin(key * 11.17 + bucket.peak * 0.91) + 1) / 2;
    // Weak cells form naturally spaced curtains instead of a manufactured
    // complete ring. Stronger regions remain continuous and brighter.
    if (bucket.peak < 12 && seam < (12 - bucket.peak) / 14) return [];
    return [{
      longitude: -180 + (key + 0.5) * bucketWidth,
      latitude,
      probability: bucket.peak,
      phase: key * 0.621 + latitude * 0.143,
    }];
  });
}

function drawAuroraCurtains(canvas: HTMLCanvasElement, map: MapLibreMap, curtains: AuroraCurtain[], enabled: boolean, time: number) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  if (!width || !height) return;
  if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (!enabled || !curtains.length) return;

  const camera = map.project(map.getCenter());
  const seconds = time / 1000;
  context.save();
  context.globalCompositeOperation = "lighter";
  for (const curtain of curtains) {
    const base = map.project([curtain.longitude, curtain.latitude]);
    if (!Number.isFinite(base.x) || !Number.isFinite(base.y) || base.x < -180 || base.x > width + 180 || base.y < -180 || base.y > height + 180) continue;
    const fromCentreX = base.x - camera.x;
    const fromCentreY = base.y - camera.y;
    const distance = Math.hypot(fromCentreX, fromCentreY);
    const outwardX = distance > 18 ? fromCentreX / distance : 0;
    const outwardY = distance > 18 ? fromCentreY / distance : -1;
    const sideX = -outwardY;
    const sideY = outwardX;
    const intensity = Math.max(0.08, Math.min(1, (curtain.probability - 5) / 45));
    const undulation = Math.sin(seconds * 0.74 + curtain.phase) * 0.5 + Math.sin(seconds * 1.31 + curtain.phase * 1.73) * 0.25;
    const viewScale = Math.max(0.85, Math.min(1.62, Math.pow(2, map.getZoom()) * 0.92));
    const curtainLength = (20 + curtain.probability * 1.82 + undulation * 10) * viewScale;
    const tipX = base.x + outwardX * curtainLength + sideX * undulation * 6;
    const tipY = base.y + outwardY * curtainLength + sideY * undulation * 6;
    const controlX = (base.x + tipX) / 2 + sideX * (7 + Math.sin(seconds * 1.12 + curtain.phase) * 6);
    const controlY = (base.y + tipY) / 2 + sideY * (7 + Math.sin(seconds * 1.12 + curtain.phase) * 6);
    const widthVariation = 1 + (Math.sin(seconds * 1.72 + curtain.phase * 1.91) + 1) * 0.5;

    const drawRibbon = (lineWidth: number, blur: number, alpha: number, colours: Array<[number, string]>) => {
      const gradient = context.createLinearGradient(base.x, base.y, tipX, tipY);
      for (const [stop, colour] of colours) gradient.addColorStop(stop, colour);
      context.beginPath();
      context.moveTo(base.x, base.y);
      context.quadraticCurveTo(controlX, controlY, tipX, tipY);
      context.strokeStyle = gradient;
      context.lineWidth = lineWidth;
      context.lineCap = "round";
      context.globalAlpha = alpha;
      context.filter = `blur(${blur}px)`;
      context.stroke();
    };

    // Broad atmospheric bloom, then a narrower moving oxygen curtain. A
    // red upper fringe only becomes visible as the forecast strengthens;
    // this avoids inventing storm colours during quiet geomagnetic periods.
    drawRibbon(8 * widthVariation * viewScale, 8, intensity * 0.13, [[0, "rgba(37,125,255,0)"], [0.2, "rgba(78,143,255,.12)"], [0.46, "rgba(89,242,155,.48)"], [0.76, curtain.probability > 40 ? "rgba(232,75,149,.26)" : "rgba(74,153,255,.08)"], [1, "rgba(219,82,164,0)"]]);
    drawRibbon(2.35 * widthVariation * viewScale, 2.25, intensity * 0.55, [[0, "rgba(139,255,214,0)"], [0.16, "rgba(82,227,178,.6)"], [0.5, "rgba(108,255,145,.9)"], [0.79, curtain.probability > 40 ? "rgba(241,83,178,.62)" : "rgba(94,172,255,.2)"], [1, "rgba(155,99,255,0)"]]);
    if (curtain.probability >= 24) {
      drawRibbon(1.25, 0.8, intensity * 0.84, [[0, "rgba(237,255,209,0)"], [0.3, "rgba(210,255,173,.96)"], [0.65, "rgba(126,255,172,.78)"], [1, "rgba(103,134,255,0)"]]);
    }
  }
  context.restore();
}

function globeData(flights: PublicRadarFlight[], selectedId: string, replay: GlobeReplay) {
  const selected = flights.find((flight) => flight.id === selectedId) ?? null;
  const aircraft: GeoJson = {
    type: "FeatureCollection",
    features: flights.flatMap((flight) => {
      const point = flight.lastSnapshot;
      if (!point || !validPoint(point.latitude, point.longitude)) return [];
      return [{
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [point.longitude, point.latitude] as [number, number] },
        properties: { id: flight.id, callsign: flight.callsign, selected: flight.id === selectedId },
      }];
    }),
  };
  const plannedPoints = (selected?.plannedRoute?.points ?? [])
    .filter((point) => validPoint(point.latitude, point.longitude))
    .map((point) => [point.longitude, point.latitude] as [number, number]);
  const recordedSnapshots = selected?.trackSnapshots?.length ? selected.trackSnapshots : selected?.recentSnapshots ?? [];
  const recordedPoints = recordedSnapshots
    .filter((point) => validPoint(point.latitude, point.longitude))
    .map((point) => [point.longitude, point.latitude] as [number, number]);
  const replayPoints = (replay?.points ?? [])
    .filter((point) => validPoint(point.latitude, point.longitude))
    .map((point) => [point.longitude, point.latitude] as [number, number]);
  const routeFeatures: GeoJson["features"] = [];
  if (plannedPoints.length > 1) routeFeatures.push({ type: "Feature", geometry: { type: "LineString", coordinates: plannedPoints }, properties: { kind: "planned" } });
  if (recordedPoints.length > 1) routeFeatures.push({ type: "Feature", geometry: { type: "LineString", coordinates: recordedPoints }, properties: { kind: "recorded" } });
  if (replayPoints.length > 1) routeFeatures.push({ type: "Feature", geometry: { type: "LineString", coordinates: replayPoints }, properties: { kind: "replay" } });
  const routes: GeoJson = { type: "FeatureCollection", features: routeFeatures };
  return { aircraft, routes };
}

function controllerData(controllers: VatsimStation[]): GeoJson {
  return {
    type: "FeatureCollection",
    features: controllers.flatMap((controller) => {
      if (controller.latitude == null || controller.longitude == null || !validPoint(controller.latitude, controller.longitude)) return [];
      return [{
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [controller.longitude, controller.latitude] as [number, number] },
        properties: { callsign: controller.callsign, kind: controller.kind },
      }];
    }),
  };
}

export function BaRadarGlobe({
  flights,
  selectedId,
  onSelect,
  controllers,
  onSelectController,
  replay,
  auroraEnabled,
  aurora,
  initialCamera,
  onCameraChange,
}: {
  flights: PublicRadarFlight[];
  selectedId: string;
  onSelect: (id: string) => void;
  controllers: VatsimStation[];
  onSelectController: (callsign: string) => void;
  replay: GlobeReplay;
  auroraEnabled: boolean;
  aurora: RadarAuroraData | null;
  initialCamera: GlobeCamera | null;
  onCameraChange: (camera: GlobeCamera) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const auroraCanvas = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const onSelectControllerRef = useRef(onSelectController);
  const onCameraChangeRef = useRef(onCameraChange);
  const data = useMemo(() => globeData(flights, selectedId, replay), [flights, selectedId, replay]);
  const controllersGeoJson = useMemo(() => controllerData(controllers), [controllers]);
  const curtainData = useMemo(() => auroraCurtains(aurora), [aurora]);
  const dataRef = useRef({ ...data, controllers: controllersGeoJson, auroraEnabled, aurora, curtains: curtainData });
  dataRef.current = { ...data, controllers: controllersGeoJson, auroraEnabled, aurora, curtains: curtainData };
  onSelectRef.current = onSelect;
  onSelectControllerRef.current = onSelectController;
  onCameraChangeRef.current = onCameraChange;

  useEffect(() => {
    let animation = 0;
    let resizeFrame = 0;
    let resizeObserver: ResizeObserver | null = null;
    let disposed = false;

    const setGeoJson = (map: MapLibreMap, id: string, value: GeoJson) => {
      const source = map.getSource(id) as GeoJSONSource | undefined;
      source?.setData(value as never);
    };
    const sync = (map: MapLibreMap) => {
      const current = dataRef.current;
      setGeoJson(map, "ba-radar-globe-aircraft", current.aircraft);
      setGeoJson(map, "ba-radar-globe-routes", current.routes);
      setGeoJson(map, "ba-radar-globe-controllers", current.controllers);
      updateAuroraSurface(map, "ba-radar-globe-aurora-glow", current.aurora, 18, 0.92);
      updateAuroraSurface(map, "ba-radar-globe-aurora-core", current.aurora, 5, 1);
      map.setLayoutProperty("ba-radar-globe-aurora-glow-layer", "visibility", current.auroraEnabled ? "visible" : "none");
      map.setLayoutProperty("ba-radar-globe-aurora-core-layer", "visibility", current.auroraEnabled ? "visible" : "none");
    };
    const start = async () => {
      if (!container.current) return;
      const maplibregl = await import("maplibre-gl");
      if (disposed || !container.current) return;
      const map = new maplibregl.Map({
        container: container.current,
        style: {
          version: 8,
          sources: {
            "ba-radar-osm": {
              type: "raster",
              // NASA's Blue Marble provides a real Earth surface instead of a
              // flat road map when the pilot is orbiting the globe.
              tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/std/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg"],
              tileSize: 256,
              attribution: "NASA GIBS · Blue Marble",
            },
          },
          layers: [{
            id: "ba-radar-osm",
            type: "raster",
            source: "ba-radar-osm",
            paint: {
              "raster-brightness-min": 0.12,
              "raster-brightness-max": 0.72,
              "raster-saturation": -0.18,
              "raster-contrast": 0.18,
            },
          }],
        },
        // Looking at the equator keeps the physical globe itself centred;
        // the northern oval then rises naturally over the horizon.
        center: initialCamera?.center ?? [-18, 18],
        zoom: initialCamera?.zoom ?? 0.1,
        minZoom: -1.3,
        bearing: initialCamera?.bearing ?? 0,
        pitch: initialCamera?.pitch ?? 0,
      });
      mapRef.current = map;
      map.on("load", () => {
        map.setProjection({ type: "globe" });
        const fogMap = map as unknown as { setFog?: (options: Record<string, unknown>) => void };
        fogMap.setFog?.({ range: [0.55, 10], color: "#071d2e", "high-color": "#246b88", "space-color": "#02060d", "horizon-blend": 0.16, "star-intensity": 0.5 });
        map.addSource("ba-radar-globe-aircraft", { type: "geojson", data: emptyCollection as never });
        map.addSource("ba-radar-globe-routes", { type: "geojson", data: emptyCollection as never });
        map.addSource("ba-radar-globe-controllers", { type: "geojson", data: emptyCollection as never });
        map.addSource("ba-radar-globe-aurora-glow", { type: "image", url: auroraTexture(dataRef.current.aurora, 18, 0.92), coordinates: auroraCoordinates });
        map.addSource("ba-radar-globe-aurora-core", { type: "image", url: auroraTexture(dataRef.current.aurora, 5, 1), coordinates: auroraCoordinates });
        map.addLayer({ id: "ba-radar-globe-aurora-glow-layer", type: "raster", source: "ba-radar-globe-aurora-glow", paint: { "raster-opacity": 0.64, "raster-fade-duration": 0 } });
        map.addLayer({ id: "ba-radar-globe-aurora-core-layer", type: "raster", source: "ba-radar-globe-aurora-core", paint: { "raster-opacity": 0.94, "raster-fade-duration": 0 } });
        map.addLayer({ id: "ba-radar-globe-planned", type: "line", source: "ba-radar-globe-routes", filter: ["==", ["get", "kind"], "planned"], paint: { "line-color": "#73bdf1", "line-width": 2.2, "line-opacity": 0.85, "line-dasharray": [2, 2] } });
        map.addLayer({ id: "ba-radar-globe-recorded", type: "line", source: "ba-radar-globe-routes", filter: ["==", ["get", "kind"], "recorded"], paint: { "line-color": "#f1c84c", "line-width": 3.5, "line-opacity": 0.96, "line-blur": 0.35 } });
        map.addLayer({ id: "ba-radar-globe-replay", type: "line", source: "ba-radar-globe-routes", filter: ["==", ["get", "kind"], "replay"], paint: { "line-color": "#d91e45", "line-width": 3.5, "line-opacity": 0.92 } });
        map.addLayer({ id: "ba-radar-globe-controllers", type: "circle", source: "ba-radar-globe-controllers", paint: { "circle-radius": 3.2, "circle-color": "#79dafa", "circle-stroke-color": "#f0fbff", "circle-stroke-width": 0.7, "circle-opacity": 0.82 } });
        map.addLayer({ id: "ba-radar-globe-aircraft-glow", type: "circle", source: "ba-radar-globe-aircraft", paint: { "circle-radius": ["case", ["get", "selected"], 12, 9], "circle-color": "#f4c430", "circle-opacity": 0.18, "circle-blur": 0.55 } });
        map.addLayer({ id: "ba-radar-globe-aircraft", type: "circle", source: "ba-radar-globe-aircraft", paint: { "circle-radius": ["case", ["get", "selected"], 6.5, 4.5], "circle-color": ["case", ["get", "selected"], "#ffffff", "#f4c430"], "circle-stroke-color": "#0a2c45", "circle-stroke-width": 1.2 } });
        const rememberCamera = () => {
          const centre = map.getCenter();
          onCameraChangeRef.current({ center: [centre.lng, centre.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
        };
        map.on("click", "ba-radar-globe-aircraft", (event) => {
          // Store the current orbit before selection updates the surrounding
          // dashboard. The selection must never decide the pilot's view.
          rememberCamera();
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === "string") onSelectRef.current(id);
        });
        map.on("mouseenter", "ba-radar-globe-aircraft", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "ba-radar-globe-aircraft", () => { map.getCanvas().style.cursor = ""; });
        map.on("click", "ba-radar-globe-controllers", (event) => {
          rememberCamera();
          const callsign = event.features?.[0]?.properties?.callsign;
          if (typeof callsign === "string") onSelectControllerRef.current(callsign);
        });
        map.on("mouseenter", "ba-radar-globe-controllers", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "ba-radar-globe-controllers", () => { map.getCanvas().style.cursor = ""; });
        map.on("moveend", rememberCamera);
        sync(map);
        const fitGlobe = (initial = false) => {
          if (disposed) return;
          const viewport = map.getContainer();
          const ratio = viewport.clientWidth / Math.max(viewport.clientHeight, 1);
          map.resize();
          if (initial) {
            // A MapLibre globe scales with the narrow dimension. Establish a
            // safe initial frame on ultrawide screens, then never overwrite a
            // pilot's orbit or zoom when the selected-flight panel changes.
            const zoom = Math.max(-0.35, Math.min(0.82, 1.16 - Math.max(0, Math.log2(ratio)) * 0.75));
            map.jumpTo({ center: [-18, 18], zoom, bearing: 0, pitch: 0 });
            // Capture the resolved camera synchronously. That makes a
            // selection immediately after first paint just as stable as one
            // made later in the session.
            rememberCamera();
          }
        };
        window.requestAnimationFrame(() => {
          fitGlobe(!initialCamera);
          resizeObserver = new ResizeObserver(() => {
            window.cancelAnimationFrame(resizeFrame);
            resizeFrame = window.requestAnimationFrame(() => fitGlobe());
          });
          resizeObserver.observe(map.getContainer());
        });
        const animateAurora = (time: number) => {
          if (disposed || !map.getSource("ba-radar-globe-aurora-core")) return;
          if (dataRef.current.auroraEnabled) {
            const shimmer = Math.sin(time / 2600) * 0.05;
            map.setPaintProperty("ba-radar-globe-aurora-glow-layer", "raster-opacity", 0.64 + shimmer);
            map.setPaintProperty("ba-radar-globe-aurora-core-layer", "raster-opacity", 0.9 + shimmer * 0.5);
          }
          if (auroraCanvas.current) drawAuroraCurtains(auroraCanvas.current, map, dataRef.current.curtains, dataRef.current.auroraEnabled, time);
          animation = window.requestAnimationFrame(animateAurora);
        };
        animation = window.requestAnimationFrame(animateAurora);
      });
    };
    void start();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(animation);
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      const liveMap = mapRef.current;
      if (liveMap) {
        const centre = liveMap.getCenter();
        onCameraChangeRef.current({ center: [centre.lng, centre.lat], zoom: liveMap.getZoom(), bearing: liveMap.getBearing(), pitch: liveMap.getPitch() });
        liveMap.remove();
      }
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      const source = map.getSource("ba-radar-globe-aircraft") as GeoJSONSource | undefined;
      source?.setData(data.aircraft as never);
      (map.getSource("ba-radar-globe-routes") as GeoJSONSource | undefined)?.setData(data.routes as never);
      (map.getSource("ba-radar-globe-controllers") as GeoJSONSource | undefined)?.setData(controllersGeoJson as never);
      updateAuroraSurface(map, "ba-radar-globe-aurora-glow", aurora, 18, 0.92);
      updateAuroraSurface(map, "ba-radar-globe-aurora-core", aurora, 5, 1);
      map.setLayoutProperty("ba-radar-globe-aurora-glow-layer", "visibility", auroraEnabled ? "visible" : "none");
      map.setLayoutProperty("ba-radar-globe-aurora-core-layer", "visibility", auroraEnabled ? "visible" : "none");
    }
  }, [data, controllersGeoJson, auroraEnabled, aurora]);

  return <div className="ba-radar-globe-map" ref={container} aria-label="BA-Radar interactive 3D globe">
    <canvas ref={auroraCanvas} className="ba-radar-globe-aurora-curtains" aria-hidden="true" />
    <div className="ba-radar-globe-caption"><strong>3D Globe</strong><span>Live BAV tracks · drag to orbit · scroll to zoom</span></div>
  </div>;
}
