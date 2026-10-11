import "server-only";

import { GribMessage, parseGribIndex, type GribIndexEntry } from "@mattnucc/gribberish";
import type { RadarCloudData, RadarCloudLayer, RadarCloudLayerId } from "@/lib/radar-external";
import { clampCloudValue, cloudGridDimension, encodeCloudHeight, isValidCloudColumn } from "@/lib/radar-cloud-math";

type Cached<T> = { value: T; expiresAt: number };
type MessageMap = Map<string, GribMessage | null>;

const GFS_BUCKET = "https://noaa-gfs-bdp-pds.s3.amazonaws.com";
const GFS_RESOLUTION_DEGREES = 1;
const DISPLAY_STRIDE = 1;
const CACHE_FOR_MS = 25 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;
const WIND_RANGE_METRES_PER_SECOND = 80;
const CONDENSATE_SCALE_KG_PER_KG = 0.0035;

let cloudCache: Cached<RadarCloudData> | null = null;

type CloudProfile = {
  id: RadarCloudLayerId;
  label: string;
  coverageField: "LCDC" | "MCDC" | "HCDC";
  coverageLevel: string;
  representativePressureHpa: number;
  basePressureHpa: number;
  topPressureHpa: number;
};

const CLOUD_PROFILES: CloudProfile[] = [
  { id: "low", label: "Low cloud", coverageField: "LCDC", coverageLevel: "low cloud layer", representativePressureHpa: 850, basePressureHpa: 925, topPressureHpa: 700 },
  { id: "middle", label: "Middle cloud", coverageField: "MCDC", coverageLevel: "middle cloud layer", representativePressureHpa: 600, basePressureHpa: 700, topPressureHpa: 400 },
  { id: "high", label: "High cloud", coverageField: "HCDC", coverageLevel: "high cloud layer", representativePressureHpa: 300, basePressureHpa: 400, topPressureHpa: 200 },
];

function gfsBaseUrl(cycle: Date) {
  const date = cycle.toISOString().slice(0, 10).replaceAll("-", "");
  const hour = String(cycle.getUTCHours()).padStart(2, "0");
  // GFS also publishes a 0.25° product. The renderer deliberately ingests
  // this official 1° product: it transports roughly 1/16 as many cells,
  // keeping the live global globe responsive without pretending the fine
  // procedural detail is observed weather.
  return `${GFS_BUCKET}/gfs.${date}/${hour}/atmos/gfs.t${hour}z.pgrb2.1p00.f000`;
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

function selectEntry(entries: GribIndexEntry[], variable: string, level: string) {
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

function fieldKey(variable: string, level: string) {
  return `${variable}:${level}`;
}

function pressureLevel(hPa: number) {
  return `${hPa} mb`;
}

function quantise(value: number, scale: number, minimum = 0, maximum = 255) {
  return clampCloudValue(Math.round(value / scale), minimum, maximum);
}

function normaliseWind(value: number) {
  return clampCloudValue(Math.round((value + WIND_RANGE_METRES_PER_SECOND) / (WIND_RANGE_METRES_PER_SECOND * 2) * 255), 0, 255);
}

function valuesFor(message: GribMessage | null | undefined) {
  return message ? message.dataAdjusted(true, true) : null;
}

function compatibleGrid(messages: GribMessage[]) {
  const first = messages[0];
  if (!first) return false;
  const { rows, cols } = first.gridShape;
  return rows >= 2 && cols >= 2 && messages.every((message) => message.gridShape.rows === rows && message.gridShape.cols === cols);
}

function encodeCloudLayer(profile: CloudProfile, fields: MessageMap): { layer: RadarCloudLayer; width: number; height: number } {
  const coverage = fields.get(fieldKey(profile.coverageField, profile.coverageLevel));
  const base = fields.get(fieldKey("HGT", pressureLevel(profile.basePressureHpa)));
  const top = fields.get(fieldKey("HGT", pressureLevel(profile.topPressureHpa)));
  if (!coverage || !base || !top || !compatibleGrid([coverage, base, top])) {
    throw new Error(`GFS ${profile.label.toLowerCase()} fields could not be aligned.`);
  }
  const { rows, cols } = coverage.gridShape;
  const outputRows = cloudGridDimension(rows, DISPLAY_STRIDE);
  const outputCols = cloudGridDimension(cols, DISPLAY_STRIDE);
  const weather = new Uint8Array(outputRows * outputCols * 4);
  const geometry = new Uint8Array(outputRows * outputCols * 4);
  const coverageValues = valuesFor(coverage)!;
  const baseValues = valuesFor(base)!;
  const topValues = valuesFor(top)!;
  const humidityValues = valuesFor(fields.get(fieldKey("RH", pressureLevel(profile.representativePressureHpa))));
  const liquidValues = valuesFor(fields.get(fieldKey("CLWMR", pressureLevel(profile.representativePressureHpa))));
  const iceValues = valuesFor(fields.get(fieldKey("ICMR", pressureLevel(profile.representativePressureHpa))));
  const windUValues = valuesFor(fields.get(fieldKey("UGRD", pressureLevel(profile.representativePressureHpa))));
  const windVValues = valuesFor(fields.get(fieldKey("VGRD", pressureLevel(profile.representativePressureHpa))));

  let output = 0;
  for (let row = 0; row < rows; row += DISPLAY_STRIDE) {
    for (let column = 0; column < cols; column += DISPLAY_STRIDE) {
      const input = row * cols + column;
      const cover = coverageValues[input];
      const baseHeight = baseValues[input];
      const topHeight = topValues[input];
      // GFS geopotential heights are expressed in geopotential metres. At
      // globe scale their difference from geometric MSL height is smaller
      // than the display grid, so retain them as model-referenced metres and
      // never advertise them as terrain-clearance measurements.
      const valid = isValidCloudColumn(cover, baseHeight, topHeight);
      const humidity = humidityValues?.[input] ?? 0;
      const condensate = Math.max(0, (liquidValues?.[input] ?? 0) + (iceValues?.[input] ?? 0));
      const windU = windUValues?.[input] ?? 0;
      const windV = windVValues?.[input] ?? 0;
      weather[output] = Number.isFinite(cover) ? clampCloudValue(Math.round(cover / 100 * 255), 0, 255) : 0;
      weather[output + 1] = Number.isFinite(humidity) ? clampCloudValue(Math.round(humidity / 100 * 255), 0, 255) : 0;
      weather[output + 2] = Number.isFinite(condensate) ? quantise(condensate, CONDENSATE_SCALE_KG_PER_KG / 255) : 0;
      weather[output + 3] = valid ? 255 : 0;
      geometry[output] = valid ? encodeCloudHeight(baseHeight) : 0;
      geometry[output + 1] = valid ? encodeCloudHeight(topHeight) : 0;
      geometry[output + 2] = Number.isFinite(windU) ? normaliseWind(windU) : 128;
      geometry[output + 3] = Number.isFinite(windV) ? normaliseWind(windV) : 128;
      output += 4;
    }
  }

  return {
    layer: {
      id: profile.id,
      label: profile.label,
      coverageField: profile.coverageField,
      representativePressureHpa: profile.representativePressureHpa,
      basePressureHpa: profile.basePressureHpa,
      topPressureHpa: profile.topPressureHpa,
      weather: Buffer.from(weather).toString("base64"),
      geometry: Buffer.from(geometry).toString("base64"),
    },
    width: outputCols,
    height: outputRows,
  };
}

async function refreshClouds(): Promise<RadarCloudData> {
  let lastError: unknown = null;
  for (const cycle of candidateCycles()) {
    const baseUrl = gfsBaseUrl(cycle);
    try {
      const indexResponse = await fetchWithTimeout(`${baseUrl}.idx`);
      if (!indexResponse.ok) throw new Error(`GFS cycle is not published (${indexResponse.status}).`);
      const entries = parseGribIndex(await indexResponse.text());
      const required = new Map<string, GribIndexEntry>();
      const optional = new Map<string, GribIndexEntry>();
      for (const profile of CLOUD_PROFILES) {
        const requirements: Array<[string, string]> = [
          [profile.coverageField, profile.coverageLevel],
          ["HGT", pressureLevel(profile.basePressureHpa)],
          ["HGT", pressureLevel(profile.topPressureHpa)],
          ["RH", pressureLevel(profile.representativePressureHpa)],
          ["UGRD", pressureLevel(profile.representativePressureHpa)],
          ["VGRD", pressureLevel(profile.representativePressureHpa)],
        ];
        for (const [variable, level] of requirements) {
          const key = fieldKey(variable, level);
          const entry = selectEntry(entries, variable, level);
          if (!entry && (variable === profile.coverageField || variable === "HGT")) {
            throw new Error(`GFS ${key} is unavailable.`);
          }
          if (entry) required.set(key, entry);
        }
        for (const variable of ["CLWMR", "ICMR"]) {
          const level = pressureLevel(profile.representativePressureHpa);
          const entry = selectEntry(entries, variable, level);
          if (entry) optional.set(fieldKey(variable, level), entry);
        }
      }
      const uniqueRequired = [...required.entries()];
      const uniqueOptional = [...optional.entries()];
      const fetchedRequired = await Promise.all(uniqueRequired.map(async ([key, entry]) => [key, await fetchMessage(baseUrl, entry)] as const));
      const fetchedOptional = await Promise.all(uniqueOptional.map(async ([key, entry]) => {
        try {
          return [key, await fetchMessage(baseUrl, entry)] as const;
        } catch {
          return [key, null] as const;
        }
      }));
      const fields: MessageMap = new Map([...fetchedRequired, ...fetchedOptional]);
      const first = fetchedRequired[0]?.[1];
      if (!first) throw new Error("GFS did not provide a cloud grid.");
      const encodedLayers = CLOUD_PROFILES.map((profile) => encodeCloudLayer(profile, fields));
      const dimensions = encodedLayers[0];
      if (!dimensions || encodedLayers.some((entry) => entry.width !== dimensions.width || entry.height !== dimensions.height)) {
        throw new Error("GFS cloud layers have incompatible grids.");
      }
      const availableFields = [...fields.entries()].filter(([, message]) => message).map(([key]) => key);
      return {
        source: "NOAA GFS",
        sourceResolutionDeg: GFS_RESOLUTION_DEGREES,
        displayResolutionDeg: GFS_RESOLUTION_DEGREES * DISPLAY_STRIDE,
        cycleAt: first.referenceDate.toISOString(),
        validAt: first.forecastDate.toISOString(),
        fetchedAt: new Date().toISOString(),
        stale: false,
        width: dimensions.width,
        height: dimensions.height,
        west: -180,
        north: 90,
        stepDeg: GFS_RESOLUTION_DEGREES * DISPLAY_STRIDE,
        encoding: "rgba8-base64",
        fields: availableFields,
        layers: encodedLayers.map((entry) => entry.layer),
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("No published GFS cloud model is currently available.");
}

/** Returns the latest decoded analysis, retaining a clearly stale last-good model during a temporary GFS outage. */
export async function getRadarCloudData() {
  if (cloudCache && cloudCache.expiresAt > Date.now()) return cloudCache.value;
  try {
    const value = await refreshClouds();
    cloudCache = { value, expiresAt: Date.now() + CACHE_FOR_MS };
    return value;
  } catch (error) {
    if (cloudCache) return { ...cloudCache.value, stale: true };
    throw error;
  }
}

