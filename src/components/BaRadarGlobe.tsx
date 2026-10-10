"use client";

import { useEffect, useMemo, useRef } from "react";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { RadarAuroraData, VatsimStation } from "@/lib/radar-external";
import type { PublicRadarFlight } from "@/lib/radar-live";
import { BaRadarAuroraLayer } from "@/components/BaRadarAuroraLayer";

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
  const mapRef = useRef<MapLibreMap | null>(null);
  const auroraLayerRef = useRef<BaRadarAuroraLayer | null>(null);
  const onSelectRef = useRef(onSelect);
  const onSelectControllerRef = useRef(onSelectController);
  const onCameraChangeRef = useRef(onCameraChange);
  const data = useMemo(() => globeData(flights, selectedId, replay), [flights, selectedId, replay]);
  const controllersGeoJson = useMemo(() => controllerData(controllers), [controllers]);
  const dataRef = useRef({ ...data, controllers: controllersGeoJson, auroraEnabled, aurora });
  dataRef.current = { ...data, controllers: controllersGeoJson, auroraEnabled, aurora };
  onSelectRef.current = onSelect;
  onSelectControllerRef.current = onSelectController;
  onCameraChangeRef.current = onCameraChange;

  useEffect(() => {
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
      auroraLayerRef.current?.update(current.aurora, current.auroraEnabled);
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
        // Keep the planet itself centred; the northern oval then rises
        // naturally over the horizon without pushing the Earth downward.
        // Begin over the North Atlantic rather than the equator, so the
        // globe is still centred but its auroral oval is naturally in view.
        center: initialCamera?.center ?? [10, 67],
        zoom: initialCamera?.zoom ?? 0.1,
        minZoom: -1.3,
        bearing: initialCamera?.bearing ?? 0,
        // A shallow orbital angle lets the live aurora read as a suspended
        // curtain rather than a flat ring; a pilot's saved orbit still wins.
        pitch: initialCamera?.pitch ?? 22,
      });
      mapRef.current = map;
      map.on("load", () => {
        map.setProjection({ type: "globe" });
        const fogMap = map as unknown as { setFog?: (options: Record<string, unknown>) => void };
        fogMap.setFog?.({ range: [0.55, 10], color: "#071d2e", "high-color": "#246b88", "space-color": "#02060d", "horizon-blend": 0.16, "star-intensity": 0.5 });
        map.addSource("ba-radar-globe-aircraft", { type: "geojson", data: emptyCollection as never });
        map.addSource("ba-radar-globe-routes", { type: "geojson", data: emptyCollection as never });
        map.addSource("ba-radar-globe-controllers", { type: "geojson", data: emptyCollection as never });
        const auroraLayer = new BaRadarAuroraLayer();
        auroraLayerRef.current = auroraLayer;
        auroraLayer.update(dataRef.current.aurora, dataRef.current.auroraEnabled);
        map.addLayer(auroraLayer);
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
            map.jumpTo({ center: [10, 67], zoom, bearing: 0, pitch: 22 });
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
      });
    };
    void start();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      const liveMap = mapRef.current;
      if (liveMap) {
        const centre = liveMap.getCenter();
        onCameraChangeRef.current({ center: [centre.lng, centre.lat], zoom: liveMap.getZoom(), bearing: liveMap.getBearing(), pitch: liveMap.getPitch() });
        liveMap.remove();
      }
      mapRef.current = null;
      auroraLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      const source = map.getSource("ba-radar-globe-aircraft") as GeoJSONSource | undefined;
      source?.setData(data.aircraft as never);
      (map.getSource("ba-radar-globe-routes") as GeoJSONSource | undefined)?.setData(data.routes as never);
      (map.getSource("ba-radar-globe-controllers") as GeoJSONSource | undefined)?.setData(controllersGeoJson as never);
      auroraLayerRef.current?.update(aurora, auroraEnabled);
    }
  }, [data, controllersGeoJson, auroraEnabled, aurora]);

  return <div className="ba-radar-globe-map" ref={container} aria-label="BA-Radar interactive 3D globe">
    <div className="ba-radar-globe-caption"><strong>3D Globe</strong><span>Live BAV tracks · drag to orbit · scroll to zoom</span></div>
  </div>;
}
