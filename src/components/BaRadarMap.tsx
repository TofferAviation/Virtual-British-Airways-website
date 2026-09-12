"use client";

import L from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer } from "react-leaflet";
import type { PublicRadarFlight } from "@/components/PublicBaRadar";

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

export function BaRadarMap({ flights, selectedId, onSelect }: { flights: PublicRadarFlight[]; selectedId: string; onSelect: (id: string) => void }) {
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
    {trail.length > 1 ? <Polyline positions={trail} pathOptions={{ color: "#e9ba2f", weight: 3, opacity: 0.9 }} /> : null}
    {positioned.map((flight) => <Marker key={flight.id} position={[flight.lastSnapshot!.latitude, flight.lastSnapshot!.longitude]} icon={aircraftIcon(flight, flight.id === selectedId)} eventHandlers={{ click: () => onSelect(flight.id) }} />)}
  </MapContainer>;
}
