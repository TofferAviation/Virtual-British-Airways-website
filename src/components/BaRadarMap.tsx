"use client";

import L from "leaflet";
import { GeoJSON, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { useState } from "react";
import type { RadarWeatherData, VatsimStation, WindVector } from "@/lib/radar-external";
import type { PublicRadarFlight, RadarLayers } from "@/components/PublicBaRadar";

type Position = [number, number];

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function aircraftIcon(flight: PublicRadarFlight, selected: boolean) {
  const snapshot = flight.lastSnapshot!;
  return L.divIcon({
    className: "ba-radar-leaflet-icon-shell",
    html: `<span class="ba-radar-leaflet-icon ${selected ? "selected" : ""} ${flight.connectionHealthy ? "connected" : "stale"}"><b style="transform:rotate(${Math.round(snapshot.headingDeg)}deg)">✈</b><em>${escapeHtml(flight.flightNumber)}</em></span>`,
    iconSize: [54, 45],
    iconAnchor: [27, 22],
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

function windIcon(wind: WindVector) {
  const direction = Math.round((wind.directionDeg + 180) % 360);
  return L.divIcon({
    className: "ba-radar-wind-icon-shell",
    html: `<span class="ba-radar-wind-icon" title="Wind ${Math.round(wind.directionDeg)}° at ${Math.round(wind.speedKt)} kt"><b style="transform:rotate(${direction}deg)">➤</b><em>${Math.round(wind.speedKt)}</em></span>`,
    iconSize: [32, 31],
    iconAnchor: [16, 15],
  });
}

function hasLocation(controller: VatsimStation): controller is VatsimStation & { latitude: number; longitude: number } {
  return controller.latitude !== null && controller.longitude !== null;
}

function isUkPriorityController(controller: VatsimStation) {
  return /^(EG|EI)/.test(controller.callsign);
}

function MapLayers({
  controllers,
  weather,
  layers,
  selectedController,
  onSelectController,
}: {
  controllers: VatsimStation[];
  weather: RadarWeatherData | null;
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
  const winds = (weather?.winds ?? []).filter((wind) => view.bounds.pad(0.1).contains([wind.latitude, wind.longitude]));

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
    {layers.winds ? winds.map((wind) => <Marker key={`${wind.latitude}:${wind.longitude}`} position={[wind.latitude, wind.longitude]} icon={windIcon(wind)} interactive={false} />) : null}
    {layers.vatsim ? controllerMarkers.map((controller) => <Marker key={`${controller.kind}:${controller.callsign}`} position={[controller.latitude, controller.longitude]} icon={controllerIcon(controller, controller.callsign === selectedController)} eventHandlers={{ click: () => onSelectController(controller.callsign) }} />) : null}
  </>;
}

export function BaRadarMap({
  flights,
  selectedId,
  onSelect,
  controllers,
  weather,
  layers,
  selectedController,
  onSelectController,
}: {
  flights: PublicRadarFlight[];
  selectedId: string;
  onSelect: (id: string) => void;
  controllers: VatsimStation[];
  weather: RadarWeatherData | null;
  layers: RadarLayers;
  selectedController: string;
  onSelectController: (callsign: string) => void;
}) {
  const positioned = flights.filter((flight) => flight.lastSnapshot);
  const selected = positioned.find((flight) => flight.id === selectedId) ?? null;
  const trail: Position[] = (selected?.recentSnapshots ?? [])
    .filter((snapshot) => Number.isFinite(snapshot.latitude) && Number.isFinite(snapshot.longitude))
    .map((snapshot) => [snapshot.latitude, snapshot.longitude]);

  return <MapContainer className="ba-radar-leaflet-map" center={[27, -13]} zoom={2} minZoom={2} maxZoom={11} worldCopyJump scrollWheelZoom>
    <TileLayer
      url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
      maxZoom={19}
    />
    <MapLayers controllers={controllers} weather={weather} layers={layers} selectedController={selectedController} onSelectController={onSelectController} />
    {trail.length > 1 ? <Polyline positions={trail} pathOptions={{ color: "#e9ba2f", weight: 3, opacity: 0.9 }} /> : null}
    {positioned.map((flight) => <Marker key={flight.id} position={[flight.lastSnapshot!.latitude, flight.lastSnapshot!.longitude]} icon={aircraftIcon(flight, flight.id === selectedId)} eventHandlers={{ click: () => onSelect(flight.id) }} />)}
  </MapContainer>;
}
