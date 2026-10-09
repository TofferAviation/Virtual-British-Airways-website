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
    geometry: { type: "Point"; coordinates: [number, number] } | { type: "LineString"; coordinates: Array<[number, number]> };
    properties: Record<string, string | number | boolean>;
  }>;
};

const emptyCollection: GeoJson = { type: "FeatureCollection", features: [] };

function validPoint(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function auroraData(data: RadarAuroraData | null): GeoJson {
  return {
    type: "FeatureCollection",
    features: (data?.samples ?? []).map((sample) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [sample.longitude > 180 ? sample.longitude - 360 : sample.longitude, sample.latitude] as [number, number] },
      properties: { probability: sample.probability },
    })),
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
      setGeoJson(map, "ba-radar-globe-aurora", auroraData(current.aurora));
      map.setLayoutProperty("ba-radar-globe-aurora-glow", "visibility", current.auroraEnabled ? "visible" : "none");
      map.setLayoutProperty("ba-radar-globe-aurora-core", "visibility", current.auroraEnabled ? "visible" : "none");
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
          layers: [{ id: "ba-radar-osm", type: "raster", source: "ba-radar-osm" }],
        },
        center: [-13, 42],
        zoom: 1.45,
        bearing: -12,
        pitch: 24,
      });
      mapRef.current = map;
      map.on("load", () => {
        map.setProjection({ type: "globe" });
        const fogMap = map as unknown as { setFog?: (options: Record<string, unknown>) => void };
        fogMap.setFog?.({ range: [0.55, 10], color: "#071d2e", "high-color": "#1e6f94", "space-color": "#02060d", "horizon-blend": 0.12, "star-intensity": 0.38 });
        map.addSource("ba-radar-globe-aircraft", { type: "geojson", data: emptyCollection as never });
        map.addSource("ba-radar-globe-routes", { type: "geojson", data: emptyCollection as never });
        map.addSource("ba-radar-globe-controllers", { type: "geojson", data: emptyCollection as never });
        map.addSource("ba-radar-globe-aurora", { type: "geojson", data: emptyCollection as never });
        map.addLayer({ id: "ba-radar-globe-aurora-glow", type: "circle", source: "ba-radar-globe-aurora", paint: { "circle-radius": ["interpolate", ["linear"], ["get", "probability"], 5, 2, 30, 5, 60, 8, 100, 11], "circle-color": ["interpolate", ["linear"], ["get", "probability"], 5, "#45b9ff", 30, "#5fe5bb", 60, "#a1f47a", 100, "#d5a0ff"], "circle-opacity": 0.18, "circle-blur": 0.8 } });
        map.addLayer({ id: "ba-radar-globe-aurora-core", type: "circle", source: "ba-radar-globe-aurora", paint: { "circle-radius": ["interpolate", ["linear"], ["get", "probability"], 5, 0.8, 30, 1.3, 60, 2.1, 100, 2.7], "circle-color": ["interpolate", ["linear"], ["get", "probability"], 5, "#80dfff", 30, "#77f6c1", 60, "#c3fa82", 100, "#efbdff"], "circle-opacity": 0.66, "circle-blur": 0.32 } });
        map.addLayer({ id: "ba-radar-globe-planned", type: "line", source: "ba-radar-globe-routes", filter: ["==", ["get", "kind"], "planned"], paint: { "line-color": "#73bdf1", "line-width": 2.2, "line-opacity": 0.85, "line-dasharray": [2, 2] } });
        map.addLayer({ id: "ba-radar-globe-recorded", type: "line", source: "ba-radar-globe-routes", filter: ["==", ["get", "kind"], "recorded"], paint: { "line-color": "#f1c84c", "line-width": 3.5, "line-opacity": 0.96, "line-blur": 0.35 } });
        map.addLayer({ id: "ba-radar-globe-replay", type: "line", source: "ba-radar-globe-routes", filter: ["==", ["get", "kind"], "replay"], paint: { "line-color": "#d91e45", "line-width": 3.5, "line-opacity": 0.92 } });
        map.addLayer({ id: "ba-radar-globe-controllers", type: "circle", source: "ba-radar-globe-controllers", paint: { "circle-radius": 4, "circle-color": ["case", ["==", ["get", "kind"], "atis"], "#b59bff", "#67d7fc"], "circle-stroke-color": "#dff7ff", "circle-stroke-width": 1.2, "circle-opacity": 0.9 } });
        map.addLayer({ id: "ba-radar-globe-aircraft-glow", type: "circle", source: "ba-radar-globe-aircraft", paint: { "circle-radius": ["case", ["get", "selected"], 12, 9], "circle-color": "#f4c430", "circle-opacity": 0.18, "circle-blur": 0.55 } });
        map.addLayer({ id: "ba-radar-globe-aircraft", type: "circle", source: "ba-radar-globe-aircraft", paint: { "circle-radius": ["case", ["get", "selected"], 6.5, 4.5], "circle-color": ["case", ["get", "selected"], "#ffffff", "#f4c430"], "circle-stroke-color": "#0a2c45", "circle-stroke-width": 1.2 } });
        map.on("click", "ba-radar-globe-aircraft", (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === "string") onSelectRef.current(id);
        });
        map.on("click", "ba-radar-globe-controllers", (event) => {
          const callsign = event.features?.[0]?.properties?.callsign;
          if (typeof callsign === "string") onSelectControllerRef.current(callsign);
        });
        map.on("mouseenter", "ba-radar-globe-aircraft", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "ba-radar-globe-aircraft", () => { map.getCanvas().style.cursor = ""; });
        sync(map);
        const animateAurora = (time: number) => {
          if (disposed || !map.getSource("ba-radar-globe-aurora")) return;
          if (dataRef.current.auroraEnabled) {
            const shimmer = Math.sin(time / 1850) * 0.045;
            map.setPaintProperty("ba-radar-globe-aurora-glow", "circle-opacity", 0.18 + shimmer);
            map.setPaintProperty("ba-radar-globe-aurora-core", "circle-opacity", 0.66 + shimmer);
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
      (map.getSource("ba-radar-globe-aurora") as GeoJSONSource | undefined)?.setData(auroraData(aurora) as never);
      map.setLayoutProperty("ba-radar-globe-aurora-glow", "visibility", auroraEnabled ? "visible" : "none");
      map.setLayoutProperty("ba-radar-globe-aurora-core", "visibility", auroraEnabled ? "visible" : "none");
    }
  }, [data, controllersGeoJson, auroraEnabled, aurora]);

  return <div className="ba-radar-globe-map" ref={container} aria-label="BA-Radar interactive 3D globe">
    <div className="ba-radar-globe-caption"><strong>3D Globe</strong><span>Live BAV tracks · drag to orbit · scroll to zoom</span></div>
  </div>;
}
