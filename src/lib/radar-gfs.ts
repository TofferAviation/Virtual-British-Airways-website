import "server-only";

import { GribMessage, parseGribIndex, type GribIndexEntry } from "@mattnucc/gribberish";
import { radarWindLayer, type RadarWindGrid, type RadarWindLayer } from "@/lib/radar-external";

type Cached<T> = { value: T; expiresAt: number };

const GFS_BUCKET = "https://noaa-gfs-bdp-pds.s3.amazonaws.com";
const DISPLAY_STRIDE = 2;
const VALUE_SCALE = 10;
const CACHE_FOR_MS = 20 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

const windCache = new Map<string, Cached<RadarWindGrid>>();

function gfsBaseUrl(cycle: Date) {
  const date = cycle.toISOString().slice(0, 10).replaceAll("-", "");
  const hour = String(cycle.getUTCHours()).padStart(2, "0");
  return `${GFS_BUCKET}/gfs.${date}/${hour}/atmos/gfs.t${hour}z.pgrb2.0p25.f000`;
}

function candidateCycles() {
  const now = new Date();
  const hour = Math.floor(now.getUTCHours() / 6) * 6;
  const latest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
  return Array.from({ length: 6 }, (_, index) => new Date(latest.getTime() - index * 6 * 60 * 60_000));
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function fieldLevel(layer: RadarWindLayer) {
  return layer.hPa === null ? "10 m above ground" : `${layer.hPa} mb`;
}

function selectEntry(entries: GribIndexEntry[], variable: "UGRD" | "VGRD", level: string) {
  return entries.find((entry) => entry.var === variable && entry.level === level && entry.forecastTime === "anl")
    ?? entries.find((entry) => entry.var === variable && entry.level === level);
}

async function fetchMessage(baseUrl: string, entry: GribIndexEntry) {
  if (!entry.length) throw new Error("Published GFS index did not include a usable field length.");
  const lastByte = entry.offset + entry.length - 1;
  const response = await fetchWithTimeout(baseUrl, { headers: { Range: `bytes=${entry.offset}-${lastByte}` } });
  if (!response.ok && response.status !== 206) throw new Error(`GFS field request returned ${response.status}.`);
  return GribMessage.parseFromBuffer(new Uint8Array(await response.arrayBuffer()), 0);
}

function encodeComponent(values: number[], rows: number, cols: number) {
  const displayRows = Math.floor((rows - 1) / DISPLAY_STRIDE) + 1;
  const displayCols = Math.floor((cols - 1) / DISPLAY_STRIDE) + 1;
  const quantised = new Int16Array(displayRows * displayCols);
  let output = 0;
  for (let row = 0; row < rows; row += DISPLAY_STRIDE) {
    for (let column = 0; column < cols; column += DISPLAY_STRIDE) {
      const value = values[row * cols + column];
      quantised[output] = Number.isFinite(value) ? Math.max(-32_768, Math.min(32_767, Math.round(value * VALUE_SCALE))) : 0;
      output += 1;
    }
  }
  return { encoded: Buffer.from(quantised.buffer, quantised.byteOffset, quantised.byteLength).toString("base64"), width: displayCols, height: displayRows };
}

async function refreshWindGrid(layer: RadarWindLayer): Promise<RadarWindGrid> {
  const level = fieldLevel(layer);
  let lastError: unknown = null;
  for (const cycle of candidateCycles()) {
    const baseUrl = gfsBaseUrl(cycle);
    try {
      const indexResponse = await fetchWithTimeout(`${baseUrl}.idx`);
      if (!indexResponse.ok) throw new Error(`GFS cycle is not published (${indexResponse.status}).`);
      const entries = parseGribIndex(await indexResponse.text());
      const uEntry = selectEntry(entries, "UGRD", level);
      const vEntry = selectEntry(entries, "VGRD", level);
      if (!uEntry || !vEntry) throw new Error(`GFS ${level} wind components are unavailable.`);
      const [uMessage, vMessage] = await Promise.all([fetchMessage(baseUrl, uEntry), fetchMessage(baseUrl, vEntry)]);
      const { rows, cols } = uMessage.gridShape;
      if (rows !== vMessage.gridShape.rows || cols !== vMessage.gridShape.cols || rows < 2 || cols < 2) {
        throw new Error("GFS wind components have incompatible grids.");
      }
      const u = encodeComponent(uMessage.dataAdjusted(true, true), rows, cols);
      const v = encodeComponent(vMessage.dataAdjusted(true, true), rows, cols);
      if (u.width !== v.width || u.height !== v.height) throw new Error("GFS wind display grid could not be aligned.");
      return {
        source: "NOAA GFS",
        sourceResolutionDeg: 0.25,
        displayResolutionDeg: 0.5,
        layer,
        cycleAt: uMessage.referenceDate.toISOString(),
        validAt: uMessage.forecastDate.toISOString(),
        width: u.width,
        height: u.height,
        west: -180,
        north: 90,
        stepDeg: 0.5,
        valueScale: VALUE_SCALE,
        encoding: "int16-le-base64",
        u: u.encoded,
        v: v.encoded,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No published GFS wind field is currently available.");
}

export async function getRadarGfsWindGrid(requestedWindLayer?: string | null) {
  const layer = radarWindLayer(requestedWindLayer);
  const cached = windCache.get(layer.id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await refreshWindGrid(layer);
  windCache.set(layer.id, { value, expiresAt: Date.now() + CACHE_FOR_MS });
  return value;
}
