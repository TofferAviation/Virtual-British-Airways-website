/**
 * Imports the editable, public OpenStreetMap aeroway geometry for EGLL.
 *
 * Run manually during development when a geometry refresh is wanted:
 *   node scripts/import-egll-osm-geometry.mjs
 *
 * The website never calls Overpass. It reads the committed GeoJSON generated
 * by this utility from /public/airport-geometry/EGLL.geojson instead.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const airport = "EGLL";
const bounds = { south: 51.455, west: -0.502, north: 51.48, east: -0.415 };
const endpoint = "https://overpass-api.de/api/interpreter";
const aerowayTypes = ["runway", "taxiway", "apron", "parking_position", "holding_position", "gate"];
const query = `[out:json][timeout:90];
(
  way["aeroway"="runway"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  way["aeroway"="taxiway"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  way["aeroway"="apron"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  nwr["aeroway"="parking_position"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  nwr["aeroway"="holding_position"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  nwr["aeroway"="gate"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out tags geom;`;

function coordinatesFor(element) {
  if (!Array.isArray(element.geometry)) return [];
  return element.geometry
    .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lon))
    .map((point) => [point.lon, point.lat]);
}

function lineFeature(element, kind) {
  const coordinates = coordinatesFor(element);
  if (coordinates.length < 2) return null;
  const closed = coordinates.length >= 4
    && coordinates[0][0] === coordinates.at(-1)[0]
    && coordinates[0][1] === coordinates.at(-1)[1];
  const isArea = kind === "apron" || closed;
  return {
    type: "Feature",
    properties: {
      aeroway: kind,
      osmType: element.type,
      osmId: element.id,
      ref: element.tags?.ref ?? null,
      name: element.tags?.name ?? null,
      surface: element.tags?.surface ?? null,
    },
    geometry: isArea
      ? { type: "Polygon", coordinates: [closed ? coordinates : [...coordinates, coordinates[0]]] }
      : { type: "LineString", coordinates },
  };
}

function pointFeature(element, kind) {
  if (!Number.isFinite(element.lat) || !Number.isFinite(element.lon)) return null;
  return {
    type: "Feature",
    properties: {
      aeroway: kind,
      osmType: element.type,
      osmId: element.id,
      ref: element.tags?.ref ?? null,
      name: element.tags?.name ?? null,
    },
    geometry: { type: "Point", coordinates: [element.lon, element.lat] },
  };
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    "user-agent": "BritishAirwaysVirtual/1.0 Heathrow geometry importer",
  },
  body: new URLSearchParams({ data: query }),
});
if (!response.ok) throw new Error(`Overpass returned ${response.status} ${response.statusText}`);
const payload = await response.json();
if (!Array.isArray(payload.elements)) throw new Error("Overpass response did not contain elements.");

const features = payload.elements.flatMap((element) => {
  const kind = element?.tags?.aeroway;
  if (!aerowayTypes.includes(kind)) return [];
  const feature = element.type === "node" ? pointFeature(element, kind) : lineFeature(element, kind);
  return feature ? [feature] : [];
});

const featureCounts = Object.fromEntries(aerowayTypes.map((kind) => [kind, features.filter((feature) => feature.properties.aeroway === kind).length]));
if (!featureCounts.runway || !featureCounts.taxiway) {
  throw new Error(`Incomplete EGLL import: ${JSON.stringify(featureCounts)}`);
}

const geojson = {
  type: "FeatureCollection",
  metadata: {
    airport,
    source: "OpenStreetMap aeroway geometry via Overpass API",
    sourceUrl: "https://www.openstreetmap.org/copyright",
    importedAt: new Date().toISOString(),
    bounds,
    featureCounts,
  },
  features,
};

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "public", "airport-geometry");
const outputPath = path.join(outputDirectory, `${airport}.geojson`);
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(geojson)}\n`);
console.log(`Wrote ${outputPath} with ${features.length} EGLL aeroway features.`, featureCounts);
