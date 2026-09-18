import type { SimbriefRoutePoint } from "@/lib/pilot-operations-store";

type Position = { name: string; latitude: number; longitude: number };

export type RouteWindPoint = {
  label: string;
  name: string;
  speedKt: number;
  directionDeg: number;
  tailwindKt: number;
  crosswindKt: number;
  sampledAt: string;
};

export type RouteWindBriefing = {
  cruiseAltitudeFt: number;
  pressureLevel: number;
  requestedDeparture: string;
  points: RouteWindPoint[];
  averageTailwindKt: number;
  strongestWindKt: number;
};

const WIND_LEVELS = [
  { hPa: 850, altitudeFt: 4_920 }, { hPa: 700, altitudeFt: 9_840 }, { hPa: 600, altitudeFt: 13_780 },
  { hPa: 500, altitudeFt: 18_370 }, { hPa: 400, altitudeFt: 23_620 }, { hPa: 300, altitudeFt: 30_180 },
  { hPa: 250, altitudeFt: 34_120 }, { hPa: 200, altitudeFt: 38_710 }, { hPa: 150, altitudeFt: 44_290 },
] as const;

const cache = new Map<string, { expiresAt: number; value: RouteWindBriefing | null }>();

function finiteNumber(value: unknown) {
  const result = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(result) ? result : null;
}

function radians(value: number) { return value * Math.PI / 180; }
function degrees(value: number) { return value * 180 / Math.PI; }

function distanceNm(a: Position, b: Position) {
  const lat = radians(b.latitude - a.latitude);
  const lon = radians(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 3_440.065 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearing(a: Position, b: Position) {
  const lon = radians(b.longitude - a.longitude);
  const y = Math.sin(lon) * Math.cos(radians(b.latitude));
  const x = Math.cos(radians(a.latitude)) * Math.sin(radians(b.latitude)) - Math.sin(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.cos(lon);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
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

function parseCruiseAltitude(value: string | null) {
  const match = (value?.trim().toUpperCase() ?? "").match(/(?:FL\s*)?(\d{2,5})/);
  const raw = Number(match?.[1] ?? 340);
  return Number.isFinite(raw) ? raw < 1_000 ? raw * 100 : raw : 34_000;
}

function closestWindLevel(altitudeFt: number) {
  return WIND_LEVELS.reduce((closest, item) => Math.abs(item.altitudeFt - altitudeFt) < Math.abs(closest.altitudeFt - altitudeFt) ? item : closest);
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
  const labels = ["Departure", "Climb", "Cruise", "Cruise", "Arrival"];
  const all = [origin, ...navlog, destination];
  const deduplicated = all.filter((point, index) => index === 0 || distanceNm(point, all[index - 1]) > 1);
  const fallback = () => labels.map((label, index) => ({ label, point: greatCirclePoint(origin, destination, index / (labels.length - 1)), fraction: index / (labels.length - 1) }));
  if (deduplicated.length < 3) return fallback();
  const legs = deduplicated.slice(1).map((point, index) => distanceNm(deduplicated[index], point));
  const total = legs.reduce((sum, leg) => sum + leg, 0);
  if (!total) return fallback();
  return labels.map((label, sampleIndex) => {
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

export async function getRouteWindBriefing(input: {
  originIcao: string | null;
  destinationIcao: string | null;
  originLatitude: number | null | undefined;
  originLongitude: number | null | undefined;
  destinationLatitude: number | null | undefined;
  destinationLongitude: number | null | undefined;
  routePoints: SimbriefRoutePoint[] | undefined;
  cruiseAltitude: string | null;
  estimatedOut: string | null;
  scheduledOut: string | null;
  date: string;
  departure: string;
  duration: string;
}): Promise<RouteWindBriefing | null> {
  const start = flightStart(input);
  if (!start) return null;
  const forecastRange = start.getTime() - Date.now();
  if (forecastRange < -3 * 60 * 60 * 1_000 || forecastRange > 16 * 24 * 60 * 60 * 1_000) return null;
  const cachedKey = JSON.stringify([input.originIcao, input.destinationIcao, input.cruiseAltitude, start.toISOString().slice(0, 13)]);
  const cached = cache.get(cachedKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const codes = [input.originIcao, input.destinationIcao].filter((value): value is string => Boolean(value));
  const airports = await airportPositions(codes).catch(() => new Map<string, Position>());
  const origin = input.originLatitude !== null && input.originLatitude !== undefined && input.originLongitude !== null && input.originLongitude !== undefined
    ? { name: input.originIcao ?? "Departure", latitude: input.originLatitude, longitude: input.originLongitude }
    : input.originIcao ? airports.get(input.originIcao) : null;
  const destination = input.destinationLatitude !== null && input.destinationLatitude !== undefined && input.destinationLongitude !== null && input.destinationLongitude !== undefined
    ? { name: input.destinationIcao ?? "Arrival", latitude: input.destinationLatitude, longitude: input.destinationLongitude }
    : input.destinationIcao ? airports.get(input.destinationIcao) : null;
  if (!origin || !destination) { cache.set(cachedKey, { expiresAt: Date.now() + 5 * 60_000, value: null }); return null; }

  const requestedCruiseAltitude = parseCruiseAltitude(input.cruiseAltitude);
  const level = closestWindLevel(requestedCruiseAltitude);
  const corridor = corridorPoints(origin, destination, input.routePoints ?? []);
  const speedVariable = `wind_speed_${level.hPa}hPa`;
  const directionVariable = `wind_direction_${level.hPa}hPa`;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({ latitude: corridor.map((entry) => entry.point.latitude.toFixed(4)).join(","), longitude: corridor.map((entry) => entry.point.longitude.toFixed(4)).join(","), hourly: `${speedVariable},${directionVariable}`, wind_speed_unit: "kn", timezone: "GMT", forecast_days: "16" }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!response.ok) { cache.set(cachedKey, { expiresAt: Date.now() + 5 * 60_000, value: null }); return null; }
  const payload = await response.json().catch(() => null);
  const forecasts: unknown[] = Array.isArray(payload) ? payload : [payload];
  const durationMinutes = parseDurationMinutes(input.duration);
  const points = corridor.flatMap((entry, index) => {
    const forecast = forecasts[index] && typeof forecasts[index] === "object" ? forecasts[index] as Record<string, unknown> : null;
    const hourly = forecast?.hourly && typeof forecast.hourly === "object" ? forecast.hourly as Record<string, unknown> : null;
    const target = new Date(start.getTime() + durationMinutes * 60_000 * entry.fraction);
    const hourlyIndex = nearestHourlyIndex(hourly?.time, target);
    const speeds = hourly?.[speedVariable];
    const directions = hourly?.[directionVariable];
    const speed = Array.isArray(speeds) ? finiteNumber(speeds[hourlyIndex]) : null;
    const direction = Array.isArray(directions) ? finiteNumber(directions[hourlyIndex]) : null;
    if (hourlyIndex < 0 || speed === null || direction === null) return [];
    const next = corridor[Math.min(corridor.length - 1, index + 1)]?.point ?? entry.point;
    const previous = corridor[Math.max(0, index - 1)]?.point ?? entry.point;
    const track = bearing(previous, next);
    const windTravel = (direction + 180) % 360;
    const relative = radians(windTravel - track);
    const times = hourly?.time;
    return [{ label: entry.label, name: entry.point.name, speedKt: speed, directionDeg: direction, tailwindKt: speed * Math.cos(relative), crosswindKt: speed * Math.sin(relative), sampledAt: Array.isArray(times) && typeof times[hourlyIndex] === "string" ? times[hourlyIndex] : target.toISOString() }];
  });
  if (points.length < 3) { cache.set(cachedKey, { expiresAt: Date.now() + 5 * 60_000, value: null }); return null; }
  const value: RouteWindBriefing = { cruiseAltitudeFt: requestedCruiseAltitude, pressureLevel: level.hPa, requestedDeparture: start.toISOString(), points, averageTailwindKt: points.reduce((sum, point) => sum + point.tailwindKt, 0) / points.length, strongestWindKt: Math.max(...points.map((point) => point.speedKt)) };
  cache.set(cachedKey, { expiresAt: Date.now() + 15 * 60_000, value });
  return value;
}
