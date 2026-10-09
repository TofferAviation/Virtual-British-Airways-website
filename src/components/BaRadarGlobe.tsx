"use client";

import { useEffect, useMemo, useRef } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { RadarAuroraData, VatsimStation } from "@/lib/radar-external";
import type { PublicRadarFlight } from "@/lib/radar-live";

type GlobeReplay = { id: string; points: Array<{ latitude: number; longitude: number; headingDeg: number }>; activeIndex: number } | null;

type GeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] } | { type: "LineString"; coordinates: Array<[number, number]> } | { type: "Polygon"; coordinates: Array<Array<[number, number]>> };
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

function auroraVolumes(data: RadarAuroraData | null, time: number): GeoJson {
  if (!data?.samples.length) return emptyCollection;
  const bucketWidth = 2;
  const buckets = new Map<number, { latitudeTotal: number; weight: number; peak: number }>();
  for (const sample of data.samples) {
    if (sample.latitude > auroraNorth || sample.probability < 6) continue;
    const longitude = sample.longitude > 180 ? sample.longitude - 360 : sample.longitude;
    const key = Math.max(0, Math.min(179, Math.floor((longitude + 180) / bucketWidth)));
    const current = buckets.get(key) ?? { latitudeTotal: 0, weight: 0, peak: 0 };
    const weight = sample.probability * sample.probability;
    current.latitudeTotal += sample.latitude * weight;
    current.weight += weight;
    current.peak = Math.max(current.peak, sample.probability);
    buckets.set(key, current);
  }
  return {
    type: "FeatureCollection",
    features: [...buckets.entries()].flatMap(([key, bucket]) => {
      if (!bucket.weight || bucket.peak < 6) return [];
      const longitude = -180 + key * bucketWidth;
      const latitude = bucket.latitudeTotal / bucket.weight;
      const halfWidth = Math.min(3.5, 1 + bucket.peak / 5.8);
      // The oval position and brightness are NOAA data. The movement only
      // gives the otherwise static forecast field a gentle curtain motion.
      const flutter = 0.86 + Math.sin(time * 1.55 + key * 0.72) * 0.14;
      // Nitrogen sits beneath 100 km; the familiar green oxygen curtain is
      // around 100–150 km. Pink is a lower energetic mix, while red oxygen
      // only appears above 200 km during stronger activity.
      const violetHeight = 99_000 + bucket.peak * 260 * flutter;
      const greenHeight = 142_000 + bucket.peak * 520 * flutter;
      const magentaHeight = 112_000 + bucket.peak * 420 * (0.82 + Math.sin(time * 1.18 + key * 0.43) * 0.18);
      const redHeight = 218_000 + bucket.peak * 1_050 * (0.84 + Math.sin(time * 0.94 + key * 0.51) * 0.16);
      const greenColour = bucket.peak < 11 ? "#58ce9e" : bucket.peak < 20 ? "#48eab3" : "#a9f681";
      return [{
        type: "Feature" as const,
        geometry: {
          type: "Polygon" as const,
          coordinates: [[
            [longitude, latitude - halfWidth],
            [longitude + bucketWidth, latitude - halfWidth],
            [longitude + bucketWidth, latitude + halfWidth],
            [longitude, latitude + halfWidth],
            [longitude, latitude - halfWidth],
          ]],
        },
        properties: {
          peak: bucket.peak,
          violetBase: 78_000,
          violetHeight,
          greenBase: 99_000,
          greenHeight,
          magentaBase: 91_000,
          magentaHeight,
          redBase: 195_000,
          redHeight,
          greenColour,
          magentaColour: "#d94da3",
          redColour: "#ef5b68",
        },
      }];
    }),
  };
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
}: {
  flights: PublicRadarFlight[];
  selectedId: string;
  onSelect: (id: string) => void;
  controllers: VatsimStation[];
  onSelectController: (callsign: string) => void;
  replay: GlobeReplay;
  auroraEnabled: boolean;
  aurora: RadarAuroraData | null;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const onSelectControllerRef = useRef(onSelectController);
  const data = useMemo(() => globeData(flights, selectedId, replay), [flights, selectedId, replay]);
  const controllersGeoJson = useMemo(() => controllerData(controllers), [controllers]);
  const dataRef = useRef({ ...data, controllers: controllersGeoJson, auroraEnabled, aurora });
  dataRef.current = { ...data, controllers: controllersGeoJson, auroraEnabled, aurora };
  onSelectRef.current = onSelect;
  onSelectControllerRef.current = onSelectController;

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
      setGeoJson(map, "ba-radar-globe-aurora-volume", auroraVolumes(current.aurora, performance.now() / 1000));
      updateAuroraSurface(map, "ba-radar-globe-aurora-glow", current.aurora, 18, 0.92);
      updateAuroraSurface(map, "ba-radar-globe-aurora-core", current.aurora, 5, 1);
      map.setLayoutProperty("ba-radar-globe-aurora-glow-layer", "visibility", current.auroraEnabled ? "visible" : "none");
      map.setLayoutProperty("ba-radar-globe-aurora-core-layer", "visibility", current.auroraEnabled ? "visible" : "none");
      for (const id of ["ba-radar-globe-aurora-violet", "ba-radar-globe-aurora-green", "ba-radar-globe-aurora-magenta", "ba-radar-globe-aurora-red"]) {
        map.setLayoutProperty(id, "visibility", current.auroraEnabled ? "visible" : "none");
      }
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
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
            },
          },
          layers: [{
            id: "ba-radar-osm",
            type: "raster",
            source: "ba-radar-osm",
            paint: {
              "raster-brightness-min": 0.04,
              "raster-brightness-max": 0.48,
              "raster-saturation": -0.68,
              "raster-contrast": 0.2,
            },
          }],
        },
        // Looking at the equator keeps the physical globe itself centred;
        // the northern oval then rises naturally over the horizon.
        center: [-18, 0],
        zoom: 0.1,
        minZoom: -1.3,
        bearing: 0,
        pitch: 0,
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
        map.addSource("ba-radar-globe-aurora-volume", { type: "geojson", data: emptyCollection as never });
        map.addLayer({ id: "ba-radar-globe-aurora-glow-layer", type: "raster", source: "ba-radar-globe-aurora-glow", paint: { "raster-opacity": 0.64, "raster-fade-duration": 0 } });
        map.addLayer({ id: "ba-radar-globe-aurora-core-layer", type: "raster", source: "ba-radar-globe-aurora-core", paint: { "raster-opacity": 0.94, "raster-fade-duration": 0 } });
        map.addLayer({ id: "ba-radar-globe-aurora-violet", type: "fill-extrusion", source: "ba-radar-globe-aurora-volume", paint: { "fill-extrusion-color": "#7a5af8", "fill-extrusion-base": ["get", "violetBase"], "fill-extrusion-height": ["get", "violetHeight"], "fill-extrusion-opacity": 0.42 } });
        map.addLayer({ id: "ba-radar-globe-aurora-green", type: "fill-extrusion", source: "ba-radar-globe-aurora-volume", paint: { "fill-extrusion-color": ["get", "greenColour"], "fill-extrusion-base": ["get", "greenBase"], "fill-extrusion-height": ["get", "greenHeight"], "fill-extrusion-opacity": 0.58 } });
        map.addLayer({ id: "ba-radar-globe-aurora-magenta", type: "fill-extrusion", source: "ba-radar-globe-aurora-volume", filter: [">=", ["get", "peak"], 22], paint: { "fill-extrusion-color": ["get", "magentaColour"], "fill-extrusion-base": ["get", "magentaBase"], "fill-extrusion-height": ["get", "magentaHeight"], "fill-extrusion-opacity": 0.34 } });
        map.addLayer({ id: "ba-radar-globe-aurora-red", type: "fill-extrusion", source: "ba-radar-globe-aurora-volume", filter: [">=", ["get", "peak"], 50], paint: { "fill-extrusion-color": ["get", "redColour"], "fill-extrusion-base": ["get", "redBase"], "fill-extrusion-height": ["get", "redHeight"], "fill-extrusion-opacity": 0.28 } });
        map.addLayer({ id: "ba-radar-globe-planned", type: "line", source: "ba-radar-globe-routes", filter: ["==", ["get", "kind"], "planned"], paint: { "line-color": "#73bdf1", "line-width": 2.2, "line-opacity": 0.85, "line-dasharray": [2, 2] } });
        map.addLayer({ id: "ba-radar-globe-recorded", type: "line", source: "ba-radar-globe-routes", filter: ["==", ["get", "kind"], "recorded"], paint: { "line-color": "#f1c84c", "line-width": 3.5, "line-opacity": 0.96, "line-blur": 0.35 } });
        map.addLayer({ id: "ba-radar-globe-replay", type: "line", source: "ba-radar-globe-routes", filter: ["==", ["get", "kind"], "replay"], paint: { "line-color": "#d91e45", "line-width": 3.5, "line-opacity": 0.92 } });
        map.addLayer({ id: "ba-radar-globe-controllers", type: "circle", source: "ba-radar-globe-controllers", paint: { "circle-radius": 3.2, "circle-color": "#79dafa", "circle-stroke-color": "#f0fbff", "circle-stroke-width": 0.7, "circle-opacity": 0.82 } });
        map.addLayer({ id: "ba-radar-globe-aircraft-glow", type: "circle", source: "ba-radar-globe-aircraft", paint: { "circle-radius": ["case", ["get", "selected"], 12, 9], "circle-color": "#f4c430", "circle-opacity": 0.18, "circle-blur": 0.55 } });
        map.addLayer({ id: "ba-radar-globe-aircraft", type: "circle", source: "ba-radar-globe-aircraft", paint: { "circle-radius": ["case", ["get", "selected"], 6.5, 4.5], "circle-color": ["case", ["get", "selected"], "#ffffff", "#f4c430"], "circle-stroke-color": "#0a2c45", "circle-stroke-width": 1.2 } });
        map.on("click", "ba-radar-globe-aircraft", (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === "string") onSelectRef.current(id);
        });
        map.on("mouseenter", "ba-radar-globe-aircraft", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "ba-radar-globe-aircraft", () => { map.getCanvas().style.cursor = ""; });
        map.on("click", "ba-radar-globe-controllers", (event) => {
          const callsign = event.features?.[0]?.properties?.callsign;
          if (typeof callsign === "string") onSelectControllerRef.current(callsign);
        });
        map.on("mouseenter", "ba-radar-globe-controllers", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "ba-radar-globe-controllers", () => { map.getCanvas().style.cursor = ""; });
        sync(map);
        const fitGlobe = () => {
          if (disposed) return;
          const viewport = map.getContainer();
          const ratio = viewport.clientWidth / Math.max(viewport.clientHeight, 1);
          // A MapLibre globe scales with the narrow dimension. This keeps the
          // complete Earth centred on ultrawide screens instead of clipping it.
          const zoom = Math.max(-1.3, Math.min(0.62, 0.82 - Math.max(0, Math.log2(ratio)) * 0.92));
          map.resize();
          map.jumpTo({ center: [-18, 0], zoom, bearing: 0, pitch: 0 });
        };
        window.requestAnimationFrame(() => {
          fitGlobe();
          resizeObserver = new ResizeObserver(() => {
            window.cancelAnimationFrame(resizeFrame);
            resizeFrame = window.requestAnimationFrame(fitGlobe);
          });
          resizeObserver.observe(map.getContainer());
        });
        let lastVolumeUpdate = 0;
        const animateAurora = (time: number) => {
          if (disposed || !map.getSource("ba-radar-globe-aurora-core")) return;
          if (dataRef.current.auroraEnabled) {
            const shimmer = Math.sin(time / 2600) * 0.05;
            map.setPaintProperty("ba-radar-globe-aurora-glow-layer", "raster-opacity", 0.64 + shimmer);
            map.setPaintProperty("ba-radar-globe-aurora-core-layer", "raster-opacity", 0.9 + shimmer * 0.5);
            if (time - lastVolumeUpdate > 80) {
              setGeoJson(map, "ba-radar-globe-aurora-volume", auroraVolumes(dataRef.current.aurora, time / 1000));
              lastVolumeUpdate = time;
            }
          }
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
      mapRef.current?.remove();
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
      (map.getSource("ba-radar-globe-aurora-volume") as GeoJSONSource | undefined)?.setData(auroraVolumes(aurora, performance.now() / 1000) as never);
      updateAuroraSurface(map, "ba-radar-globe-aurora-glow", aurora, 18, 0.92);
      updateAuroraSurface(map, "ba-radar-globe-aurora-core", aurora, 5, 1);
      map.setLayoutProperty("ba-radar-globe-aurora-glow-layer", "visibility", auroraEnabled ? "visible" : "none");
      map.setLayoutProperty("ba-radar-globe-aurora-core-layer", "visibility", auroraEnabled ? "visible" : "none");
      for (const id of ["ba-radar-globe-aurora-violet", "ba-radar-globe-aurora-green", "ba-radar-globe-aurora-magenta", "ba-radar-globe-aurora-red"]) {
        map.setLayoutProperty(id, "visibility", auroraEnabled ? "visible" : "none");
      }
    }
  }, [data, controllersGeoJson, auroraEnabled, aurora]);

  return <div className="ba-radar-globe-map" ref={container} aria-label="BA-Radar interactive 3D globe">
    <div className="ba-radar-globe-caption"><strong>3D Globe</strong><span>Live BAV tracks · drag to orbit · scroll to zoom</span></div>
  </div>;
}
