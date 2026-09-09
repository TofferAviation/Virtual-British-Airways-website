import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AcarsFlightSnapshot, SupportedSimulator } from "@/lib/acars-contract";

const DATA_DIR = path.join(process.cwd(), ".bav-data");
const FILE = path.join(DATA_DIR, "acars-sessions.json");

export type AcarsSessionStatus = "active" | "completed" | "disconnected";

export type AcarsSession = {
  id: string;
  pilotId: string;
  pilotNumber: string;
  pilotName: string;
  bookingId: string;
  flightNumber: string;
  from: string;
  to: string;
  aircraft: string;
  simulator: SupportedSimulator;
  status: AcarsSessionStatus;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  firstFuelKg: number | null;
  lastFuelKg: number | null;
  distanceNm: number;
  landingFpm: number | null;
  lastSnapshot: AcarsFlightSnapshot | null;
};

type State = { version: 1; sessions: AcarsSession[] };

async function readState(): Promise<State> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<State>;
    return { version: 1, sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const state: State = { version: 1, sessions: [] };
    await fs.writeFile(FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    return state;
  }
}

async function writeState(state: State) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function haversineNm(a: AcarsFlightSnapshot, b: AcarsFlightSnapshot) {
  const toRad = (value: number) => value * Math.PI / 180;
  const earthNm = 3440.065;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthNm * Math.asin(Math.sqrt(Math.min(1, h)));
}

export async function startAcarsSession(input: Omit<AcarsSession, "id" | "status" | "startedAt" | "updatedAt" | "completedAt" | "firstFuelKg" | "lastFuelKg" | "distanceNm" | "landingFpm" | "lastSnapshot">) {
  const state = await readState();
  for (const session of state.sessions) {
    if (session.pilotId === input.pilotId && session.status === "active") session.status = "disconnected";
  }
  const now = new Date().toISOString();
  const session: AcarsSession = {
    ...input,
    id: randomUUID(),
    status: "active",
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    firstFuelKg: null,
    lastFuelKg: null,
    distanceNm: 0,
    landingFpm: null,
    lastSnapshot: null,
  };
  state.sessions.push(session);
  await writeState(state);
  return session;
}

export async function getAcarsSession(id: string) {
  const state = await readState();
  return state.sessions.find((session) => session.id === id) ?? null;
}

export async function appendAcarsSnapshot(id: string, pilotId: string, snapshot: AcarsFlightSnapshot) {
  const state = await readState();
  const session = state.sessions.find((item) => item.id === id && item.pilotId === pilotId);
  if (!session || session.status !== "active") return null;
  if (session.lastSnapshot) {
    const leg = haversineNm(session.lastSnapshot, snapshot);
    if (Number.isFinite(leg) && leg >= 0 && leg < 25) session.distanceNm += leg;
  }
  if (session.firstFuelKg == null && snapshot.fuelKg != null) session.firstFuelKg = snapshot.fuelKg;
  if (snapshot.fuelKg != null) session.lastFuelKg = snapshot.fuelKg;
  if (snapshot.onGround && snapshot.verticalSpeedFpm != null && snapshot.verticalSpeedFpm < -20) {
    session.landingFpm = Math.round(snapshot.verticalSpeedFpm);
  }
  session.lastSnapshot = snapshot;
  session.updatedAt = new Date().toISOString();
  await writeState(state);
  return session;
}

export async function completeAcarsSession(id: string, pilotId: string, landingFpm?: number | null) {
  const state = await readState();
  const session = state.sessions.find((item) => item.id === id && item.pilotId === pilotId);
  if (!session || session.status !== "active") return null;
  session.status = "completed";
  session.completedAt = new Date().toISOString();
  session.updatedAt = session.completedAt;
  if (landingFpm != null && Number.isFinite(landingFpm)) session.landingFpm = Math.round(landingFpm);
  await writeState(state);
  return session;
}

export async function listLiveAcarsSessions() {
  const state = await readState();
  const cutoff = Date.now() - 90_000;
  return state.sessions
    .filter((session) => session.status === "active")
    .map((session) => ({ ...session, connectionHealthy: new Date(session.updatedAt).getTime() >= cutoff }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
