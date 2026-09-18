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
  { id: "ba283-lhr-lax", from: "LHR", to: "LAX", flightNumber: "BA283", departure: "09:30", arrival: "20:50", duration: "11h 20m", aircraft: "Boeing 777-300ER", slots: 12, active: true },
  { id: "ba287-lhr-sfo", from: "LHR", to: "SFO", flightNumber: "BA287", departure: "13:30", arrival: "20:40", duration: "11h 10m", aircraft: "Boeing 777-300ER", slots: 12, active: true },
  { id: "ba48-lhr-sea", from: "LHR", to: "SEA", flightNumber: "BA48", departure: "03:20", arrival: "12:45", duration: "9h 25m", aircraft: "Boeing 777-300ER", slots: 12, active: true },
  { id: "ba197-lhr-iah", from: "LHR", to: "IAH", flightNumber: "BA197", departure: "13:45", arrival: "00:15", duration: "10h 30m", aircraft: "Boeing 777-300ER", slots: 12, active: true },
  { id: "ba11-lhr-sin", from: "LHR", to: "SIN", flightNumber: "BA11", departure: "18:25", arrival: "08:05", duration: "13h 40m", aircraft: "Boeing 777-300ER", slots: 12, active: true },
  { id: "ba55-lhr-jnb", from: "LHR", to: "JNB", flightNumber: "BA55", departure: "18:00", arrival: "05:00", duration: "11h 00m", aircraft: "Boeing 777-300ER", slots: 12, active: true },
  { id: "ba442-lhr-ams", from: "LHR", to: "AMS", flightNumber: "BA442", departure: "07:05", arrival: "09:20", duration: "1h 15m", aircraft: "Airbus A320neo", slots: 12, active: true },
  { id: "ba304-lhr-cdg", from: "LHR", to: "CDG", flightNumber: "BA304", departure: "08:15", arrival: "10:35", duration: "1h 20m", aircraft: "Airbus A320", slots: 12, active: true },
  { id: "ba824-lhr-dub", from: "LHR", to: "DUB", flightNumber: "BA824", departure: "12:20", arrival: "13:45", duration: "1h 25m", aircraft: "Airbus A320neo", slots: 12, active: true },
  { id: "ba480-lhr-bcn", from: "LHR", to: "BCN", flightNumber: "BA480", departure: "15:10", arrival: "18:25", duration: "2h 15m", aircraft: "Airbus A321neo", slots: 12, active: true },

  // 2026 traffic-informed BAV virtual hub schedule. These are curated BAV
  // services, not a claim of a live British Airways public timetable.
  { id: "ba2702-lgw-bcn", from: "LGW", to: "BCN", flightNumber: "BA2702", departure: "06:45", arrival: "10:00", duration: "2h 15m", aircraft: "Airbus A320neo", slots: 12, active: true },
  { id: "ba2694-lgw-fao", from: "LGW", to: "FAO", flightNumber: "BA2694", departure: "08:05", arrival: "10:50", duration: "2h 45m", aircraft: "Airbus A320", slots: 12, active: true },
  { id: "ba2260-lgw-dub", from: "LGW", to: "DUB", flightNumber: "BA2260", departure: "10:35", arrival: "12:05", duration: "1h 30m", aircraft: "Airbus A320neo", slots: 12, active: true },
  { id: "ba2037-lgw-mco", from: "LGW", to: "MCO", flightNumber: "BA2037", departure: "11:40", arrival: "16:25", duration: "9h 45m", aircraft: "Boeing 777-200ER", slots: 12, active: true },
  { id: "ba2203-lgw-cun", from: "LGW", to: "CUN", flightNumber: "BA2203", departure: "13:15", arrival: "19:25", duration: "10h 10m", aircraft: "Boeing 777-200ER", slots: 12, active: true },

  { id: "ba8450-lcy-ams", from: "LCY", to: "AMS", flightNumber: "BA8450", departure: "06:40", arrival: "08:50", duration: "1h 10m", aircraft: "Embraer E190", slots: 12, active: true },
  { id: "ba8700-lcy-edi", from: "LCY", to: "EDI", flightNumber: "BA8700", departure: "07:20", arrival: "08:45", duration: "1h 25m", aircraft: "Embraer E190", slots: 12, active: true },
  { id: "ba8722-lcy-gla", from: "LCY", to: "GLA", flightNumber: "BA8722", departure: "09:10", arrival: "10:40", duration: "1h 30m", aircraft: "Embraer E190", slots: 12, active: true },
  { id: "ba8456-lcy-dub", from: "LCY", to: "DUB", flightNumber: "BA8456", departure: "11:35", arrival: "13:05", duration: "1h 30m", aircraft: "Embraer E190", slots: 12, active: true },
  { id: "ba8736-lcy-fra", from: "LCY", to: "FRA", flightNumber: "BA8736", departure: "13:20", arrival: "15:55", duration: "1h 35m", aircraft: "Embraer E190", slots: 12, active: true },
  { id: "ba8474-lcy-zrh", from: "LCY", to: "ZRH", flightNumber: "BA8474", departure: "16:25", arrival: "19:15", duration: "1h 50m", aircraft: "Embraer E190", slots: 12, active: true },
  { id: "ba8478-lcy-lin", from: "LCY", to: "LIN", flightNumber: "BA8478", departure: "18:05", arrival: "21:00", duration: "1h 55m", aircraft: "Embraer E190", slots: 12, active: true },
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
    if (!Array.isArray(parsed)) return [];
    const existingIds = new Set(parsed.map((route) => route.id));
    const additions = starterSchedule.filter((route) => !existingIds.has(route.id));
    if (additions.length) {
      const merged = [...parsed, ...additions];
      await saveManagedRoutes(merged);
      return merged;
    }
    return parsed;
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
  const managed = (await getManagedRoutes()).filter((route) => route.active && route.from === from && route.to === to);
  return withAvailability(managed, date);
}

/** Lists every active BAV service departing a selected BAV hub. */
export async function getFlightsFromHub(from: string, date?: string) {
  const managed = (await getManagedRoutes()).filter((route) => route.active && route.from === from);
  return withAvailability(managed, date);
}

export async function getFlightsForAircraft(aircraft: string, date?: string) {
  const managed = (await getManagedRoutes()).filter((route) => route.active && route.aircraft === aircraft);
  return withAvailability(managed, date);
}
