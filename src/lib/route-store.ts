import { countActiveScheduleBookings } from "@/lib/pilot-operations-store";
import { getStaffState, saveStaffState } from "@/lib/staff-store";
import { BAV_NETWORK_2026 } from "@/data/bav-network-2026";

export type ManagedRoute = {
  id: string;
  from: string;
  to: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  duration: string;
  aircraft: string;
  slots: number;
  active: boolean;
  validFrom?: string;
  operatingDays?: number[];
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
    flightNumber: route.flightNumber.trim().toUpperCase(), departure: route.departure.trim(), arrival: route.arrival.trim(),
    duration: route.duration.trim(), aircraft: route.aircraft.trim(), slots: Math.max(0, Math.round(route.slots)),
    validFrom: typeof route.validFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(route.validFrom) ? route.validFrom : undefined,
    operatingDays: Array.isArray(route.operatingDays)
      ? route.operatingDays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)
      : undefined,
  })).filter((route) => {
    if (!route.id || !route.from || !route.to || !route.flightNumber || !route.aircraft || ids.has(route.id)) return false;
    ids.add(route.id);
    return true;
  });
}

export function routeOperatesOn(route: ManagedRoute, date?: string) {
  if (!date) return true;
  if (route.validFrom && date < route.validFrom) return false;
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
  if (stored.length) return stored;

  const baseline = BAV_NETWORK_2026.map((route) => ({ ...route }));
  state.routeSchedule = baseline;
  await saveStaffState(state);
  return baseline;
}

export async function saveManagedRoutes(routes: ManagedRoute[]) {
  const normalized = normalizedRoutes(routes);
  const state = await getStaffState();
  state.routeSchedule = normalized;
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
    validFrom: route.validFrom ?? existing.validFrom,
    operatingDays: route.operatingDays ?? existing.operatingDays,
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
      from: route.from,
      to: route.to,
      departure: route.departure,
      arrival: route.arrival,
      duration: route.duration,
      aircraft: route.aircraft,
      capacity: route.slots,
      slots: Math.max(0, route.slots - reserved),
    };
  }));
}

export async function getFlightsForRoute(from: string, to: string, date?: string) {
  const managed = (await getManagedRoutes()).filter((route) => route.active && route.from === from && route.to === to && routeOperatesOn(route, date));
  return withAvailability(managed, date);
}

/** Lists every active BAV service departing a selected BAV hub. */
export async function getFlightsFromHub(from: string, date?: string) {
  const managed = (await getManagedRoutes()).filter((route) => route.active && route.from === from && routeOperatesOn(route, date));
  return withAvailability(managed, date);
}

export async function getFlightsForAircraft(aircraft: string, date?: string) {
  const managed = (await getManagedRoutes()).filter((route) => route.active && route.aircraft === aircraft && routeOperatesOn(route, date));
  return withAvailability(managed, date);
}
