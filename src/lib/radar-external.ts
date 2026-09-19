type JsonRecord = Record<string, unknown>;

export type VatsimStation = {
  kind: "controller" | "atis";
  callsign: string;
  frequency: string;
  facility: string;
  facilityName: string;
  visualRangeNm: number | null;
  atis: string[];
  onlineSince: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type VatsimRadarData = {
  controllers: VatsimStation[];
  onlineCount: number;
  sourceUpdatedAt: string | null;
  available: boolean;
};

export type RadarPrecipitation = {
  tileUrl: string;
  capturedAt: string;
};

export type RadarWindLayerId = "surface" | "fl180" | "fl240" | "fl300" | "fl340" | "fl390";

export type RadarWindLayer = {
  id: RadarWindLayerId;
  label: string;
  sourceLabel: string;
  hPa: number | null;
};

export const RADAR_WIND_LAYERS: RadarWindLayer[] = [
  { id: "surface", label: "Surface", sourceLabel: "NOAA GFS 10 m analysis", hPa: null },
  { id: "fl180", label: "FL180", sourceLabel: "NOAA GFS 500 hPa analysis", hPa: 500 },
  { id: "fl240", label: "FL240", sourceLabel: "NOAA GFS 400 hPa analysis", hPa: 400 },
  { id: "fl300", label: "FL300", sourceLabel: "NOAA GFS 300 hPa analysis", hPa: 300 },
  { id: "fl340", label: "FL340", sourceLabel: "NOAA GFS 250 hPa analysis", hPa: 250 },
  { id: "fl390", label: "FL390", sourceLabel: "NOAA GFS 200 hPa analysis", hPa: 200 },
];

export type RadarWindGrid = {
  source: "NOAA GFS";
  sourceResolutionDeg: number;
  displayResolutionDeg: number;
  layer: RadarWindLayer;
  cycleAt: string;
  validAt: string;
  width: number;
  height: number;
  west: number;
  north: number;
  stepDeg: number;
  valueScale: number;
  encoding: "int16-le-base64";
  u: string;
  v: string;
};

type GeoPosition = [number, number] | [number, number, number];
type AdvisoryGeometry =
  | { type: "Polygon"; coordinates: GeoPosition[][] }
  | { type: "MultiPolygon"; coordinates: GeoPosition[][][] };

export type AviationAdvisory = {
  type: "Feature";
  geometry: AdvisoryGeometry;
  properties: {
    hazard: string;
    label: string;
    validTo: string | null;
  };
};

export type AviationAdvisories = {
  type: "FeatureCollection";
  features: AviationAdvisory[];
};

export type RadarWeatherData = {
  precipitation: RadarPrecipitation | null;
  advisories: AviationAdvisories;
  refreshedAt: string;
};

type Cached<T> = { value: T; expiresAt: number };

let vatsimCache: Cached<VatsimRadarData> | null = null;
let weatherCache: Cached<RadarWeatherData> | null = null;

const EMPTY_ADVISORIES: AviationAdvisories = { type: "FeatureCollection", features: [] };

export function radarWindLayer(value: string | null | undefined): RadarWindLayer {
  return RADAR_WIND_LAYERS.find((entry) => entry.id === value) ?? RADAR_WIND_LAYERS[0];
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(asString).filter((entry): entry is string => entry !== null).slice(0, 8) : [];
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`External radar data returned ${response.status}.`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function controllerCenter(value: unknown): { latitude: number | null; longitude: number | null } {
  const record = asRecord(value);
  const transceivers = Array.isArray(record?.transceivers) ? record.transceivers : [];
  const points = transceivers.flatMap((entry) => {
    const point = asRecord(entry);
    const latitude = asNumber(point?.latDeg);
    const longitude = asNumber(point?.lonDeg);
    return latitude === null || longitude === null ? [] : [{ latitude, longitude }];
  });
  if (!points.length) return { latitude: null, longitude: null };

  // Calculate a geographic centre rather than averaging longitudes directly,
  // which keeps a controller near the date line in the correct place.
  const total = points.reduce((sum, point) => {
    const latitude = point.latitude * Math.PI / 180;
    const longitude = point.longitude * Math.PI / 180;
    return {
      x: sum.x + Math.cos(latitude) * Math.cos(longitude),
      y: sum.y + Math.cos(latitude) * Math.sin(longitude),
      z: sum.z + Math.sin(latitude),
    };
  }, { x: 0, y: 0, z: 0 });
  const longitude = Math.atan2(total.y, total.x);
  const hypotenuse = Math.sqrt(total.x ** 2 + total.y ** 2);
  const latitude = Math.atan2(total.z, hypotenuse);
  return { latitude: latitude * 180 / Math.PI, longitude: longitude * 180 / Math.PI };
}

function stationFromRecord(value: unknown, kind: VatsimStation["kind"], facilities: Map<number, { short: string; longName: string }>, centres: Map<string, { latitude: number | null; longitude: number | null }>): VatsimStation | null {
  const record = asRecord(value);
  const callsign = asString(record?.callsign)?.toUpperCase();
  if (!record || !callsign) return null;
  const facilityId = asNumber(record.facility);
  const facility = facilityId === null ? null : facilities.get(facilityId);
  const directLatitude = asNumber(record.latitude);
  const directLongitude = asNumber(record.longitude);
  const centre = centres.get(callsign);
  return {
    kind,
    callsign,
    frequency: asString(record.frequency) ?? "Frequency unavailable",
    facility: facility?.short ?? (kind === "atis" ? "ATIS" : "ATC"),
    facilityName: facility?.longName ?? (kind === "atis" ? "Automatic terminal information service" : "Air traffic control"),
    visualRangeNm: asNumber(record.visual_range),
    atis: asStringArray(record.text_atis),
    onlineSince: asString(record.logon_time),
    latitude: directLatitude ?? centre?.latitude ?? null,
    longitude: directLongitude ?? centre?.longitude ?? null,
  };
}

async function refreshVatsim(): Promise<VatsimRadarData> {
  const [networkResult, audioResult] = await Promise.allSettled([
    fetchJson("https://data.vatsim.net/v3/vatsim-data.json"),
    fetchJson("https://data.vatsim.net/v3/transceivers-data.json"),
  ]);
  if (networkResult.status !== "fulfilled") throw networkResult.reason;
  const network = asRecord(networkResult.value);
  if (!network) throw new Error("VATSIM returned an invalid network data feed.");

  const facilities = new Map<number, { short: string; longName: string }>();
  for (const entry of Array.isArray(network.facilities) ? network.facilities : []) {
    const facility = asRecord(entry);
    const id = asNumber(facility?.id);
    if (id === null) continue;
    facilities.set(id, { short: asString(facility?.short) ?? "ATC", longName: asString(facility?.long_name) ?? "Air traffic control" });
  }

  const centres = new Map<string, { latitude: number | null; longitude: number | null }>();
  if (audioResult.status === "fulfilled" && Array.isArray(audioResult.value)) {
    for (const entry of audioResult.value) {
      const record = asRecord(entry);
      const callsign = asString(record?.callsign)?.toUpperCase();
      if (callsign) centres.set(callsign, controllerCenter(record));
    }
  }

  const controllers = [
    ...(Array.isArray(network.controllers) ? network.controllers.map((entry) => stationFromRecord(entry, "controller", facilities, centres)) : []),
    ...(Array.isArray(network.atis) ? network.atis.map((entry) => stationFromRecord(entry, "atis", facilities, centres)) : []),
  ].filter((entry): entry is VatsimStation => entry !== null).sort((a, b) => a.callsign.localeCompare(b.callsign));

  const general = asRecord(network.general);
  return {
    controllers,
    onlineCount: controllers.filter((entry) => entry.kind === "controller").length,
    sourceUpdatedAt: asString(general?.update_timestamp),
    available: true,
  };
}

export async function getVatsimRadarData() {
  if (vatsimCache && vatsimCache.expiresAt > Date.now()) return vatsimCache.value;
  try {
    const value = await refreshVatsim();
    vatsimCache = { value, expiresAt: Date.now() + 15_000 };
    return value;
  } catch {
    return vatsimCache?.value ?? { controllers: [], onlineCount: 0, sourceUpdatedAt: null, available: false };
  }
}

function validPosition(value: unknown): GeoPosition | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = asNumber(value[0]);
  const latitude = asNumber(value[1]);
  const altitude = asNumber(value[2]);
  if (longitude === null || latitude === null) return null;
  return altitude === null ? [longitude, latitude] : [longitude, latitude, altitude];
}

function validRing(value: unknown): GeoPosition[] | null {
  if (!Array.isArray(value)) return null;
  const ring = value.map(validPosition).filter((entry): entry is GeoPosition => entry !== null);
  return ring.length >= 3 ? ring : null;
}

function validPolygon(value: unknown): GeoPosition[][] | null {
  if (!Array.isArray(value)) return null;
  const polygon = value.map(validRing).filter((entry): entry is GeoPosition[] => entry !== null);
  return polygon.length ? polygon : null;
}

function advisoryGeometry(value: unknown): AdvisoryGeometry | null {
  const record = asRecord(value);
  if (!record) return null;
  if (record.type === "Polygon") {
    const coordinates = validPolygon(record.coordinates);
    return coordinates ? { type: "Polygon", coordinates } : null;
  }
  if (record.type === "MultiPolygon" && Array.isArray(record.coordinates)) {
    const coordinates = record.coordinates.map(validPolygon).filter((entry): entry is GeoPosition[][] => entry !== null);
    return coordinates.length ? { type: "MultiPolygon", coordinates } : null;
  }
  return null;
}

function normaliseAdvisories(value: unknown): AviationAdvisories {
  const record = asRecord(value);
  const features = Array.isArray(record?.features) ? record.features : [];
  return {
    type: "FeatureCollection",
    features: features.flatMap((entry) => {
      const feature = asRecord(entry);
      const geometry = advisoryGeometry(feature?.geometry);
      const properties = asRecord(feature?.properties);
      if (!geometry || !properties) return [];
      const hazard = asString(properties.hazard) ?? asString(properties.phenomenon) ?? asString(properties.type) ?? "Aviation advisory";
      const severity = asString(properties.severity) ?? asString(properties.intensity);
      const validTo = asString(properties.validTimeTo) ?? asString(properties.valid_to) ?? asString(properties.valid_end);
      return [{ type: "Feature" as const, geometry, properties: { hazard, label: severity ? `${hazard} · ${severity}` : hazard, validTo } }];
    }),
  };
}

async function getPrecipitation(): Promise<RadarPrecipitation | null> {
  const source = asRecord(await fetchJson("https://api.rainviewer.com/public/weather-maps.json"));
  const radar = asRecord(source?.radar);
  const frames = Array.isArray(radar?.past) ? radar.past : [];
  const latest = asRecord(frames.at(-1));
  const host = asString(source?.host);
  const path = asString(latest?.path);
  const timestamp = asNumber(latest?.time);
  if (!host || !path || timestamp === null) return null;
  return {
    tileUrl: `${host}${path}/512/{z}/{x}/{y}/2/1_1.png`,
    capturedAt: new Date(timestamp * 1000).toISOString(),
  };
}

async function getAdvisories() {
  const source = await fetchJson("https://aviationweather.gov/api/data/airsigmet?format=geojson");
  return normaliseAdvisories(source);
}

async function refreshWeather(): Promise<RadarWeatherData> {
  const [precipitation, advisories] = await Promise.allSettled([getPrecipitation(), getAdvisories()]);
  return {
    precipitation: precipitation.status === "fulfilled" ? precipitation.value : null,
    advisories: advisories.status === "fulfilled" ? advisories.value : EMPTY_ADVISORIES,
    refreshedAt: new Date().toISOString(),
  };
}

export async function getRadarWeatherData() {
  if (weatherCache && weatherCache.expiresAt > Date.now()) return weatherCache.value;
  const value = await refreshWeather();
  weatherCache = { value, expiresAt: Date.now() + 5 * 60_000 };
  return value;
}
