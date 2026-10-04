import { countActiveScheduleBookings } from "@/lib/pilot-operations-store";
import { normaliseApprovedBaGroupCallsign } from "@/lib/ba-flight-identifiers";
import { getStaffState, saveStaffState } from "@/lib/staff-store";
import { BAV_NETWORK_2026, BAV_NETWORK_SCHEDULE_VERSION } from "@/data/bav-network-2026";

export type ManagedRoute = {
  id: string;
  from: string;
  to: string;
  flightNumber: string;
  /** Checked ICAO flight identifier, for example BAW267 or CFE123. */
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
  /** A researched BA flight reference, not an exact date-specific timetable. */
  referenceOnly?: boolean;
  /** The same flight number continues from this route's arrival airport. */
  continuesTo?: string;
  /** A downline sector of a through service, rather than a London-originating route. */
  connectionSegment?: boolean;
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
    callsign: normaliseApprovedBaGroupCallsign(route.callsign) ?? undefined,
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
    referenceOnly: route.referenceOnly === true,
    continuesTo: typeof route.continuesTo === "string" && /^[A-Z]{3}$/.test(route.continuesTo.trim().toUpperCase()) ? route.continuesTo.trim().toUpperCase() : undefined,
    connectionSegment: route.connectionSegment === true,
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
    // r10 corrects the original BA15 reference to model both legs of its
    // LHR–SIN–SYD through service. Replace only the untouched r9 seed; any
    // subsequent Staff Centre correction remains authoritative.
    if (route.id === "ba-reference-lhr-sin-ba15" && route.sourceUrl === "https://planefinder.net/data/flight/BA15/history/5-52295037") continue;
    // r12 adds FlightAware-verified identifiers to shipped services that
    // previously had no callsign. Keep any staff scheduling edit, but attach
    // the newly checked identifier so the service becomes bookable.
    if (shipped?.callsign && !route.callsign) {
      byId.set(route.id, { ...route, callsign: shipped.callsign, sourceUrl: shipped.sourceUrl, validatedAt: shipped.validatedAt });
      continue;
    }
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

function clockToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToClock(value: number) {
  const normalised = ((value % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalised / 60)).padStart(2, "0")}:${String(normalised % 60).padStart(2, "0")}`;
}

function durationToMinutes(value: string) {
  const match = /^(\d+)\s*h(?:\s*(\d+)\s*m)?$/i.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2] ?? 0);
}

/**
 * BAV virtual services are deliberately generated from the published
 * London-hub network. A pilot who takes one of those airframes away from a
 * hub must also be able to bring it back. These return legs are BAV virtual
 * services (never presented as a verified BA schedule), use the same
 * approved equipment, and are kept out of Staff Centre's editable route list.
 */
function virtualReturnService(route: ManagedRoute): ManagedRoute | null {
  if (!route.virtualTimetable || route.catalogueOnly) return null;
  const departure = clockToMinutes(route.arrival);
  const duration = durationToMinutes(route.duration);
  const flightNumberMatch = /^BAV(\d{1,5})$/i.exec(route.flightNumber);
  if (departure === null || duration === null || !flightNumberMatch) return null;

  // 6000–8999 are reserved for the generated return side of BAV's
  // 1000–3999 outbound virtual schedules. It remains an internal BAV
  // reference and must not claim a real-world operational callsign.
  const returnFlightNumber = `BAV${Number(flightNumberMatch[1]) + 5000}`;
  const returnDeparture = departure + 60; // virtual turnaround allowance
  return {
    ...route,
    id: `${route.id}-return`,
    from: route.to,
    to: route.from,
    flightNumber: returnFlightNumber,
    departure: minutesToClock(returnDeparture),
    arrival: minutesToClock(returnDeparture + duration),
  };
}

/** Includes generated BAV return services while leaving editable routes unchanged. */
export async function getBookableRoutes(): Promise<ManagedRoute[]> {
  const routes = await getManagedRoutes();
  const existingPairs = new Set(routes.filter((route) => route.virtualTimetable).map((route) => `${route.from}-${route.to}`));
  const existingIds = new Set(routes.map((route) => route.id));
  const returns = routes.flatMap((route) => {
    const returnRoute = virtualReturnService(route);
    if (!returnRoute || existingPairs.has(`${returnRoute.from}-${returnRoute.to}`) || existingIds.has(returnRoute.id)) return [];
    return [returnRoute];
  });
  return [...routes, ...returns];
}

export async function getBookableRoute(id: string) {
  return (await getBookableRoutes()).find((route) => route.id === id) ?? null;
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
      referenceOnly: route.referenceOnly === true,
      continuesTo: route.continuesTo,
      connectionSegment: route.connectionSegment === true,
      scheduledForSelectedDate: route.referenceOnly !== true && routeOperatesOn(route, date),
      capacity: route.slots,
      slots: Math.max(0, route.slots - reserved),
    };
  }));
}

type FlightSearchOptions = {
  /** Lets pilots book a checked real-world service outside its reference date. */
  includeVirtualFlexible?: boolean;
};

/**
 * The public booking flow is deliberately stricter than the internal route
 * catalogue. A selectable service must have both a real BA flight number and
 * the date-checked ICAO identifier actually used by the operating carrier.
 * Virtual BAV planning records remain in the staff catalogue for audit and
 * future verification, but they can never become a pilot booking or a
 * fabricated callsign.
 */
function isPublishedOperationalService(route: ManagedRoute, date?: string, includeFlexible = false) {
  return route.active &&
    !route.catalogueOnly &&
    !route.virtualTimetable &&
    Boolean(normaliseApprovedBaGroupCallsign(route.callsign)) &&
    (route.referenceOnly === true || includeFlexible || routeOperatesOn(route, date));
}

function publishedOperationalServices(routes: ManagedRoute[], date?: string, options: FlightSearchOptions = {}) {
  const exact = routes.filter((route) =>
    route.referenceOnly !== true && isPublishedOperationalService(route, date, false),
  );
  const flexible = options.includeVirtualFlexible
    ? routes.filter((route) => route.referenceOnly !== true && !routeOperatesOn(route, date) && isPublishedOperationalService(route, date, true))
    : [];
  const scheduledPairs = new Set([...exact, ...flexible].map((route) => `${route.from}-${route.to}`));
  const references = routes.filter((route) =>
    route.referenceOnly === true &&
    isPublishedOperationalService(route, date, false) &&
    !scheduledPairs.has(`${route.from}-${route.to}`),
  );
  return [...exact, ...flexible, ...references];
}

export async function getFlightsForRoute(from: string, to: string, date?: string, options: FlightSearchOptions = {}) {
  const matching = (await getBookableRoutes()).filter((route) => route.active && route.from === from && route.to === to);
  return withAvailability(publishedOperationalServices(matching, date, options), date);
}

/** Lists every published, operationally checked service from the station. */
export async function getFlightsFromStation(from: string, date?: string, options: FlightSearchOptions = {}) {
  const matching = (await getBookableRoutes()).filter((route) => route.active && route.from === from);
  return withAvailability(publishedOperationalServices(matching, date, options), date);
}

/** @deprecated Use getFlightsFromStation; retained for hub links. */
export async function getFlightsFromHub(from: string, date?: string, options: FlightSearchOptions = {}) {
  return getFlightsFromStation(from, date, options);
}

export async function getFlightsForAircraft(aircraft: string, date?: string) {
  const managed = publishedOperationalServices(await getBookableRoutes(), date)
    .filter((route) => route.aircraft === aircraft || route.aircraftOptions?.includes(aircraft));
  return withAvailability(managed, date);
}
