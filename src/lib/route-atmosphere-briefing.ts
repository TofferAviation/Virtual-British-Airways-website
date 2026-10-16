import type { SimbriefRoutePoint } from "@/lib/pilot-operations-store";

type Position = { name: string; latitude: number; longitude: number };
type CorridorSample = { label: string; point: Position; fraction: number };

export type AtmosphereLayer = {
  hPa: number;
  label: string;
  temperatureC: number | null;
  humidityPercent: number | null;
  cloudCoverPercent: number | null;
  windKt: number | null;
  directionDeg: number | null;
};

export type RouteAtmosphereStation = {
  label: string;
  name: string;
  sampledAt: string;
  weatherCode: number | null;
  cloudCoverPercent: number | null;
  lowCloudPercent: number | null;
  midCloudPercent: number | null;
  highCloudPercent: number | null;
  visibilityKm: number | null;
  precipitationMm: number | null;
  precipitationChancePercent: number | null;
  windKt: number | null;
  gustKt: number | null;
  freezingLevelFt: number | null;
  cape: number | null;
  layers: AtmosphereLayer[];
};

export type RouteAtmosphereBriefing = {
  requestedDeparture: string;
  stations: RouteAtmosphereStation[];
};

const ATMOSPHERE_LEVELS = [
  { hPa: 850, label: "Lower air" },
  { hPa: 700, label: "Mid-level" },
  { hPa: 500, label: "Upper air" },
  { hPa: 300, label: "Jet level" },
  { hPa: 250, label: "High cruise" },
  { hPa: 200, label: "Upper flow" },
] as const;

const cache = new Map<string, { expiresAt: number; value: RouteAtmosphereBriefing | null }>();

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function radians(value: number) { return value * Math.PI / 180; }
function degrees(value: number) { return value * 180 / Math.PI; }

function distanceNm(a: Position, b: Position) {
  const lat = radians(b.latitude - a.latitude);
  const lon = radians(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 3_440.065 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function greatCirclePoint(a: Position, b: Position, fraction: number): Position {
  const distance = 2 * Math.asin(Math.sqrt(Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude - a.longitude) / 2) ** 2));
  if (distance < 0.000001) return { ...a };
  const first = Math.sin((1 - fraction) * distance) / Math.sin(distance);
  const second = Math.sin(fraction * distance) / Math.sin(distance);
  const x = first * Math.cos(radians(a.latitude)) * Math.cos(radians(a.longitude)) + second * Math.cos(radians(b.latitude)) * Math.cos(radians(b.longitude));
  const y = first * Math.cos(radians(a.latitude)) * Math.sin(radians(a.longitude)) + second * Math.cos(radians(b.latitude)) * Math.sin(radians(b.longitude));
  const z = first * Math.sin(radians(a.latitude)) + second * Math.sin(radians(b.latitude));
  return { name: "Route corridor", latitude: degrees(Math.atan2(z, Math.sqrt(x * x + y * y))), longitude: degrees(Math.atan2(y, x)) };
}

function parseDurationMinutes(value: string) {
  const match = value.match(/(?:(\d+)h)?\s*(?:(\d+)m)?/i);
  return Math.max(30, Number(match?.[1] ?? 0) * 60 + Number(match?.[2] ?? 0));
}

function flightStart(input: { estimatedOut: string | null; scheduledOut: string | null; date: string; departure: string }) {
  for (const candidate of [input.estimatedOut, input.scheduledOut]) {
    const parsed = candidate ? new Date(candidate) : null;
    if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  }
  const fallback = new Date(`${input.date}T${input.departure}:00Z`);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

async function airportPositions(codes: string[]) {
  if (!codes.length) return new Map<string, Position>();
  const response = await fetch(`https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(codes.join(","))}&format=json`, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
  if (!response.ok) return new Map<string, Position>();
  const records = await response.json().catch(() => []);
  const positions = new Map<string, Position>();
  if (!Array.isArray(records)) return positions;
  for (const entry of records) {
    const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
    const code = typeof record?.icaoId === "string" ? record.icaoId : null;
    const latitude = finiteNumber(record?.lat);
    const longitude = finiteNumber(record?.lon);
    if (code && latitude !== null && longitude !== null) positions.set(code, { name: code, latitude, longitude });
  }
  return positions;
}

function corridorPoints(origin: Position, destination: Position, navlog: SimbriefRoutePoint[]) {
  const labels = ["Departure", "Climb", "Mid-route", "Descent", "Arrival"];
  const all = [origin, ...navlog, destination];
  const deduplicated = all.filter((point, index) => index === 0 || distanceNm(point, all[index - 1]) > 1);
  const fallback = () => labels.map((label, index) => ({ label, point: greatCirclePoint(origin, destination, index / (labels.length - 1)), fraction: index / (labels.length - 1) }));
  if (deduplicated.length < 3) return fallback();
  const legs = deduplicated.slice(1).map((point, index) => distanceNm(deduplicated[index], point));
  const total = legs.reduce((sum, leg) => sum + leg, 0);
  if (!total) return fallback();

  return labels.map((label, sampleIndex): CorridorSample => {
    const fraction = sampleIndex / (labels.length - 1);
    const target = total * fraction;
    let covered = 0;
    for (let index = 0; index < legs.length; index++) {
      const next = covered + legs[index];
      if (target <= next || index === legs.length - 1) {
        const legFraction = legs[index] ? (target - covered) / legs[index] : 0;
        const point = greatCirclePoint(deduplicated[index], deduplicated[index + 1], Math.min(1, Math.max(0, legFraction)));
        return { label, point: { ...point, name: fraction === 0 ? origin.name : fraction === 1 ? destination.name : deduplicated[index + 1].name }, fraction };
      }
      covered = next;
    }
    return { label, point: destination, fraction };
  });
}

function nearestHourlyIndex(times: unknown, target: Date) {
  if (!Array.isArray(times)) return -1;
  let closest = -1;
  let difference = Number.POSITIVE_INFINITY;
  times.forEach((value, index) => {
    if (typeof value !== "string") return;
    const timestamp = new Date(`${value}Z`).getTime();
    const candidate = Math.abs(timestamp - target.getTime());
    if (Number.isFinite(candidate) && candidate < difference) { closest = index; difference = candidate; }
  });
  return closest;
}

function hourlyNumber(hourly: Record<string, unknown>, field: string, index: number) {
  const values = hourly[field];
  return Array.isArray(values) ? finiteNumber(values[index]) : null;
}

function standardName(entry: CorridorSample) {
  return entry.fraction === 0 || entry.fraction === 1 ? entry.point.name : entry.label;
}

/**
 * A compact, modelled vertical weather view for a virtual-flight route.  It is
 * intentionally separate from SimBrief's OFP: its purpose is scenario planning,
 * not operational dispatch or real-world weather decision making.
 */
export async function getRouteAtmosphereBriefing(input: {
  originIcao: string | null;
  destinationIcao: string | null;
  originLatitude: number | null | undefined;
  originLongitude: number | null | undefined;
  destinationLatitude: number | null | undefined;
  destinationLongitude: number | null | undefined;
  routePoints: SimbriefRoutePoint[] | undefined;
  estimatedOut: string | null;
  scheduledOut: string | null;
  date: string;
  departure: string;
  duration: string;
}): Promise<RouteAtmosphereBriefing | null> {
  const start = flightStart(input);
  if (!start) return null;
  const forecastRange = start.getTime() - Date.now();
  if (forecastRange < -3 * 60 * 60_000 || forecastRange > 16 * 24 * 60 * 60_000) return null;
  const cachedKey = JSON.stringify([input.originIcao, input.destinationIcao, start.toISOString().slice(0, 13), input.duration]);
  const cached = cache.get(cachedKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const needsOriginPosition = input.originLatitude == null || input.originLongitude == null;
  const needsDestinationPosition = input.destinationLatitude == null || input.destinationLongitude == null;
  const codes = [needsOriginPosition ? input.originIcao : null, needsDestinationPosition ? input.destinationIcao : null].filter((value): value is string => Boolean(value));
  const airports = await airportPositions(codes).catch(() => new Map<string, Position>());
  const origin = input.originLatitude != null && input.originLongitude != null
    ? { name: input.originIcao ?? "Departure", latitude: input.originLatitude, longitude: input.originLongitude }
    : input.originIcao ? airports.get(input.originIcao) : null;
  const destination = input.destinationLatitude != null && input.destinationLongitude != null
    ? { name: input.destinationIcao ?? "Arrival", latitude: input.destinationLatitude, longitude: input.destinationLongitude }
    : input.destinationIcao ? airports.get(input.destinationIcao) : null;
  if (!origin || !destination) { cache.set(cachedKey, { expiresAt: Date.now() + 5 * 60_000, value: null }); return null; }
  const corridor = corridorPoints(origin, destination, input.routePoints ?? []);
  const surfaceFields = ["weather_code", "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high", "visibility", "precipitation_probability", "precipitation", "wind_speed_10m", "wind_gusts_10m", "freezing_level_height", "cape"];
  const layerFields = ATMOSPHERE_LEVELS.flatMap(({ hPa }) => [`temperature_${hPa}hPa`, `relative_humidity_${hPa}hPa`, `cloud_cover_${hPa}hPa`, `wind_speed_${hPa}hPa`, `wind_direction_${hPa}hPa`]);
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: corridor.map((entry) => entry.point.latitude.toFixed(4)).join(","),
    longitude: corridor.map((entry) => entry.point.longitude.toFixed(4)).join(","),
    hourly: [...surfaceFields, ...layerFields].join(","),
    wind_speed_unit: "kn",
    timezone: "GMT",
    forecast_days: "16",
  }).toString();

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" }).catch(() => null);
  if (!response?.ok) { cache.set(cachedKey, { expiresAt: Date.now() + 5 * 60_000, value: null }); return null; }
  const payload = await response.json().catch(() => null);
  const forecasts: unknown[] = Array.isArray(payload) ? payload : [payload];
  const durationMinutes = parseDurationMinutes(input.duration);
  const stations = corridor.flatMap((entry, index) => {
    const forecast = forecasts[index] && typeof forecasts[index] === "object" ? forecasts[index] as Record<string, unknown> : null;
    const hourly = forecast?.hourly && typeof forecast.hourly === "object" ? forecast.hourly as Record<string, unknown> : null;
    const target = new Date(start.getTime() + durationMinutes * 60_000 * entry.fraction);
    const hourlyIndex = nearestHourlyIndex(hourly?.time, target);
    if (!hourly || hourlyIndex < 0) return [];
    const layers = ATMOSPHERE_LEVELS.map(({ hPa, label }) => ({
      hPa, label,
      temperatureC: hourlyNumber(hourly, `temperature_${hPa}hPa`, hourlyIndex),
      humidityPercent: hourlyNumber(hourly, `relative_humidity_${hPa}hPa`, hourlyIndex),
      cloudCoverPercent: hourlyNumber(hourly, `cloud_cover_${hPa}hPa`, hourlyIndex),
      windKt: hourlyNumber(hourly, `wind_speed_${hPa}hPa`, hourlyIndex),
      directionDeg: hourlyNumber(hourly, `wind_direction_${hPa}hPa`, hourlyIndex),
    }));
    const timestamp = Array.isArray(hourly.time) && typeof hourly.time[hourlyIndex] === "string" ? hourly.time[hourlyIndex] : target.toISOString();
    return [{
      label: entry.label, name: standardName(entry), sampledAt: timestamp,
      weatherCode: hourlyNumber(hourly, "weather_code", hourlyIndex), cloudCoverPercent: hourlyNumber(hourly, "cloud_cover", hourlyIndex),
      lowCloudPercent: hourlyNumber(hourly, "cloud_cover_low", hourlyIndex), midCloudPercent: hourlyNumber(hourly, "cloud_cover_mid", hourlyIndex), highCloudPercent: hourlyNumber(hourly, "cloud_cover_high", hourlyIndex),
      visibilityKm: (() => { const metres = hourlyNumber(hourly, "visibility", hourlyIndex); return metres === null ? null : metres / 1_000; })(),
      precipitationMm: hourlyNumber(hourly, "precipitation", hourlyIndex), precipitationChancePercent: hourlyNumber(hourly, "precipitation_probability", hourlyIndex),
      windKt: hourlyNumber(hourly, "wind_speed_10m", hourlyIndex), gustKt: hourlyNumber(hourly, "wind_gusts_10m", hourlyIndex),
      freezingLevelFt: (() => { const metres = hourlyNumber(hourly, "freezing_level_height", hourlyIndex); return metres === null ? null : metres * 3.28084; })(),
      cape: hourlyNumber(hourly, "cape", hourlyIndex), layers,
    } satisfies RouteAtmosphereStation];
  });
  if (stations.length < 3) { cache.set(cachedKey, { expiresAt: Date.now() + 5 * 60_000, value: null }); return null; }
  const value = { requestedDeparture: start.toISOString(), stations } satisfies RouteAtmosphereBriefing;
  cache.set(cachedKey, { expiresAt: Date.now() + 15 * 60_000, value });
  return value;
}
