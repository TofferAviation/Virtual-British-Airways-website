import { countActiveScheduleBookings } from "@/lib/pilot-operations-store";
import { getStaffState, saveStaffState } from "@/lib/staff-store";
import { BAV_NETWORK_2026, BAV_NETWORK_SCHEDULE_VERSION } from "@/data/bav-network-2026";

export type ManagedRoute = {
  id: string;
  from: string;
  to: string;
  flightNumber: string;
  /** ICAO flight identifier, for example BAW267.  Voice callsign is SPEEDBIRD. */
  callsign?: string;
  departure: string;
  arrival: string;
  duration: string;
  aircraft: string;
  slots: number;
  active: boolean;
  validFrom?: string;
  validUntil?: string;
  operatingDays?: number[];
  aircraftOptions?: string[];
  sourceUrl?: string;
  validatedAt?: string;
  /** Timetables are references by default; Operations may opt a service into late-start scoring. */
  scheduleScoringEnabled?: boolean;
  /** Published BA airport pair with detailed BA service data still pending. */
  catalogueOnly?: boolean;
  /** BAV's own bookable schedule for a real network city pair. */
  virtualTimetable?: boolean;
};

function validRoute(value: unknown): value is ManagedRoute {
  if (!value || typeof value !== "object") return false;
  const route = value as Partial<ManagedRoute>;
  return Boolean(
    typeof route.id === "string" && typeof route.from === "string" && typeof route.to === "string" &&
    typeof route.flightNumber === "string" && typeof route.departure === "string" && typeof route.arrival === "string" &&
    typeof route.duration === "string" && typeof route.aircraft === "string" &&
    Number.isFinite(route.slots) && typeof route.active === "boolean",
  );
}

function normalizedRoutes(routes: unknown[]) {
  const ids = new Set<string>();
  return routes.filter(validRoute).map((route) => ({
    ...route,
    id: route.id.trim(), from: route.from.trim().toUpperCase(), to: route.to.trim().toUpperCase(),
    flightNumber: route.flightNumber.trim().toUpperCase(),
    callsign: typeof route.callsign === "string" && route.callsign.trim() ? route.callsign.trim().toUpperCase() : undefined,
    departure: route.departure.trim(), arrival: route.arrival.trim(),
    duration: route.duration.trim(), aircraft: route.aircraft.trim(), slots: Math.max(0, Math.round(route.slots)),
    validFrom: typeof route.validFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(route.validFrom) ? route.validFrom : undefined,
    validUntil: typeof route.validUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(route.validUntil) ? route.validUntil : undefined,
    operatingDays: Array.isArray(route.operatingDays)
      ? route.operatingDays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
      : undefined,
    aircraftOptions: Array.isArray(route.aircraftOptions)
      ? Array.from(new Set(route.aircraftOptions.filter((aircraft): aircraft is string => typeof aircraft === "string" && aircraft.trim().length > 0).map((aircraft) => aircraft.trim())))
      : undefined,
    sourceUrl: typeof route.sourceUrl === "string" && /^https:\/\//.test(route.sourceUrl) ? route.sourceUrl : undefined,
    validatedAt: typeof route.validatedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(route.validatedAt) ? route.validatedAt : undefined,
    scheduleScoringEnabled: route.scheduleScoringEnabled === true,
    catalogueOnly: route.catalogueOnly === true,
    virtualTimetable: route.virtualTimetable === true,
  })).filter((route) => {
    if (!route.id || !route.from || !route.to || !route.flightNumber || !route.aircraft || ids.has(route.id)) return false;
    ids.add(route.id);
    return true;
  });
}

export function routeOperatesOn(route: ManagedRoute, date?: string) {
  if (!date) return true;
  if (route.validFrom && date < route.validFrom) return false;
  if (route.validUntil && date > route.validUntil) return false;
  if (!route.operatingDays?.length) return true;
  const parsed = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && route.operatingDays.includes(parsed.getUTCDay());
}

/**
 * Routes share the existing persistent staff state, rather than Render's
 * disposable file system. This keeps the published network and staff edits
 * identical across deploys and across every running instance.
 */
export async function getManagedRoutes(): Promise<ManagedRoute[]> {
  const state = await getStaffState();
  const stored = normalizedRoutes(state.routeSchedule);
  const baseline = BAV_NETWORK_2026.map((route) => ({ ...route }));
  if (state.routeScheduleVersion === BAV_NETWORK_SCHEDULE_VERSION) return stored.length ? stored : baseline;

  // Staff changes are the authoritative operational record.  Merge by ID so
  // an updated shipped service never overwrites a timetable correction made
  // in Staff Centre during a later baseline release.
  const byId = new Map<string, ManagedRoute>();
  for (const route of baseline) byId.set(route.id, route);
  for (const route of stored) {
    const shipped = byId.get(route.id);
    // Previous baseline catalogue cards were never editable timetable
    // records. Replace only those placeholders with the new, bookable BAV
    // virtual schedule; preserve every staff-created or staff-edited record.
    if (shipped?.virtualTimetable && route.catalogueOnly) continue;
    byId.set(route.id, route);
  }
  const migrated = normalizedRoutes([...byId.values()]);
  state.routeSchedule = migrated;
  state.routeScheduleVersion = BAV_NETWORK_SCHEDULE_VERSION;
  await saveStaffState(state);
  return migrated;
}

export async function saveManagedRoutes(routes: ManagedRoute[]) {
  const normalized = normalizedRoutes(routes);
  const state = await getStaffState();
  state.routeSchedule = normalized;
  state.routeScheduleVersion = BAV_NETWORK_SCHEDULE_VERSION;
  await saveStaffState(state);
}

export async function createManagedRoute(route: ManagedRoute) {
  const routes = await getManagedRoutes();
  if (routes.some((item) => item.id === route.id)) throw new Error("Route already exists.");
  const next = [...routes, route];
  await saveManagedRoutes(next);
  return route;
}

export async function updateManagedRoute(id: string, route: ManagedRoute) {
  const routes = await getManagedRoutes();
  const index = routes.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Route not found.");
  const next = [...routes];
  const existing = routes[index];
  next[index] = {
    ...existing,
    ...route,
    id,
  };
  await saveManagedRoutes(next);
  return next[index];
}

export async function deleteManagedRoute(id: string) {
  const routes = await getManagedRoutes();
  const next = routes.filter((item) => item.id !== id);
  if (next.length === routes.length) throw new Error("Route not found.");
  await saveManagedRoutes(next);
}

async function withAvailability(routes: ManagedRoute[], date?: string) {
  return Promise.all(routes.map(async (route) => {
    const reserved = date ? await countActiveScheduleBookings(route.id, date) : 0;
    return {
      routeId: route.id,
      number: route.flightNumber,
      callsign: route.callsign,
      from: route.from,
      to: route.to,
      departure: route.departure,
      arrival: route.arrival,
    duration: route.duration,
    aircraft: route.aircraft,
      aircraftOptions: route.aircraftOptions,
      sourceUrl: route.sourceUrl,
      validatedAt: route.validatedAt,
      scheduleScoringEnabled: route.scheduleScoringEnabled === true,
      catalogueOnly: route.catalogueOnly === true,
      virtualTimetable: route.virtualTimetable === true,
      scheduledForSelectedDate: routeOperatesOn(route, date),
      capacity: route.slots,
      slots: Math.max(0, route.slots - reserved),
    };
  }));
}

type FlightSearchOptions = {
  /** Lets pilots fly a real BAV service on a different simulator day. */
  includeVirtualFlexible?: boolean;
};

export async function getFlightsForRoute(from: string, to: string, date?: string, options: FlightSearchOptions = {}) {
  const matching = (await getManagedRoutes()).filter((route) => route.active && route.from === from && route.to === to);
  const verified = matching.filter((route) => !route.catalogueOnly && !route.virtualTimetable && (options.includeVirtualFlexible || routeOperatesOn(route, date)));
  const verifiedPairs = new Set(verified.map((route) => `${route.from}-${route.to}`));
  const virtual = matching.filter((route) => route.virtualTimetable && !verifiedPairs.has(`${route.from}-${route.to}`));
  // A checked BA service always takes priority. Otherwise BAV's clearly
  // labelled virtual operational service keeps the real network city pair
  // bookable without inventing a BA timetable.
  return withAvailability([...verified, ...virtual], date);
}

/** Lists every active BAV service departing a selected BAV hub. */
export async function getFlightsFromHub(from: string, date?: string, options: FlightSearchOptions = {}) {
  const matching = (await getManagedRoutes()).filter((route) => route.active && route.from === from);
  const verified = matching.filter((route) => !route.catalogueOnly && !route.virtualTimetable && (options.includeVirtualFlexible || routeOperatesOn(route, date)));
  const verifiedPairs = new Set(verified.map((route) => `${route.from}-${route.to}`));
  const virtual = matching.filter((route) => route.virtualTimetable && !verifiedPairs.has(`${route.from}-${route.to}`));
  const catalogue = matching.filter((route) => route.catalogueOnly && !verifiedPairs.has(`${route.from}-${route.to}`));
  return withAvailability([...verified, ...virtual, ...catalogue], date);
}

export async function getFlightsForAircraft(aircraft: string, date?: string) {
  const managed = (await getManagedRoutes()).filter((route) => route.active && !route.catalogueOnly && (route.aircraft === aircraft || route.aircraftOptions?.includes(aircraft)) && (route.virtualTimetable || routeOperatesOn(route, date)));
  return withAvailability(managed, date);
}
