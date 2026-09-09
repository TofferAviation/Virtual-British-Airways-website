import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { countActiveScheduleBookings } from "@/lib/pilot-operations-store";

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
};

const dataDir = path.join(process.cwd(), ".bav-data");
const routesFile = path.join(dataDir, "routes.json");

const starterSchedule: ManagedRoute[] = [
  { id: "ba762-lhr-osl", from: "LHR", to: "OSL", flightNumber: "BA762", departure: "07:35", arrival: "10:45", duration: "2h 10m", aircraft: "Airbus A320neo", slots: 12, active: true },
  { id: "ba766-lhr-osl", from: "LHR", to: "OSL", flightNumber: "BA766", departure: "13:10", arrival: "16:20", duration: "2h 10m", aircraft: "Airbus A320", slots: 12, active: true },
  { id: "ba770-lhr-osl", from: "LHR", to: "OSL", flightNumber: "BA770", departure: "19:25", arrival: "22:35", duration: "2h 10m", aircraft: "Airbus A320neo", slots: 12, active: true },
  { id: "ba117-lhr-jfk", from: "LHR", to: "JFK", flightNumber: "BA117", departure: "08:20", arrival: "11:15", duration: "7h 55m", aircraft: "Boeing 777-200ER", slots: 12, active: true },
  { id: "ba175-lhr-jfk", from: "LHR", to: "JFK", flightNumber: "BA175", departure: "09:45", arrival: "12:40", duration: "7h 55m", aircraft: "Boeing 777-300ER", slots: 12, active: true },
  { id: "ba183-lhr-jfk", from: "LHR", to: "JFK", flightNumber: "BA183", departure: "19:05", arrival: "22:00", duration: "7h 55m", aircraft: "Airbus A350-1000", slots: 12, active: true },
];

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

async function seedRoutesIfMissing() {
  await ensureDataDir();
  try {
    await readFile(routesFile, "utf8");
  } catch {
    await writeFile(routesFile, `${JSON.stringify(starterSchedule, null, 2)}\n`, "utf8");
  }
}

export async function getManagedRoutes(): Promise<ManagedRoute[]> {
  await seedRoutesIfMissing();
  try {
    const raw = await readFile(routesFile, "utf8");
    const parsed = JSON.parse(raw) as ManagedRoute[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveManagedRoutes(routes: ManagedRoute[]) {
  await ensureDataDir();
  const tmp = `${routesFile}.tmp`;
  await writeFile(tmp, `${JSON.stringify(routes, null, 2)}\n`, "utf8");
  await rename(tmp, routesFile);
}

export async function createManagedRoute(route: ManagedRoute) {
  const routes = await getManagedRoutes();
  if (routes.some((item) => item.id === route.id)) throw new Error("Route already exists.");
  routes.push(route);
  await saveManagedRoutes(routes);
  return route;
}

export async function updateManagedRoute(id: string, route: ManagedRoute) {
  const routes = await getManagedRoutes();
  const index = routes.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Route not found.");
  routes[index] = { ...route, id };
  await saveManagedRoutes(routes);
  return routes[index];
}

export async function deleteManagedRoute(id: string) {
  const routes = await getManagedRoutes();
  const next = routes.filter((item) => item.id !== id);
  if (next.length === routes.length) throw new Error("Route not found.");
  await saveManagedRoutes(next);
}

export async function getFlightsForRoute(from: string, to: string, date?: string) {
  const managed = (await getManagedRoutes()).filter((route) => route.active && route.from === from && route.to === to);
  return Promise.all(managed.map(async (route) => {
    const reserved = date ? await countActiveScheduleBookings(route.id, date) : 0;
    return {
      routeId: route.id,
      number: route.flightNumber,
      departure: route.departure,
      arrival: route.arrival,
      duration: route.duration,
      aircraft: route.aircraft,
      capacity: route.slots,
      slots: Math.max(0, route.slots - reserved),
    };
  }));
}
