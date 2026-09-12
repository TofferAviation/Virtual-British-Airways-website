import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AcarsFlightSnapshot, SupportedSimulator } from "@/lib/acars-contract";

const DATA_DIR = path.join(process.cwd(), ".bav-data");
const FILE = path.join(DATA_DIR, "acars-sessions.json");
const MAX_RECENT_SNAPSHOTS = 60;

export type AcarsSessionStatus = "active" | "completed" | "disconnected";
export type AcarsSession = {
  id: string; pilotId: string; pilotNumber: string; pilotName: string; bookingId: string;
  flightNumber: string; from: string; to: string; aircraft: string; simulator: SupportedSimulator;
  status: AcarsSessionStatus; startedAt: string; updatedAt: string; completedAt: string | null;
  firstFuelKg: number | null; lastFuelKg: number | null; distanceNm: number; landingFpm: number | null;
  lastSnapshot: AcarsFlightSnapshot | null; recentSnapshots?: AcarsFlightSnapshot[];
};

type State = { version: 1; sessions: AcarsSession[] };
type NewSessionInput = Omit<AcarsSession, "id" | "status" | "startedAt" | "updatedAt" | "completedAt" | "firstFuelKg" | "lastFuelKg" | "distanceNm" | "landingFpm" | "lastSnapshot">;
type AcarsSessionRow = {
  id: string; pilot_id: string; pilot_number: string; pilot_name: string; booking_id: string;
  flight_number: string; departure_station: string; arrival_station: string; aircraft: string;
  simulator: string; status: string; started_at: string; updated_at: string; completed_at: string | null;
  first_fuel_kg: number | null; last_fuel_kg: number | null; distance_nm: number; landing_fpm: number | null;
  last_snapshot: unknown; recent_snapshots: unknown;
};

function isSupportedSimulator(value: unknown): value is SupportedSimulator {
  return value === "xplane12" || value === "msfs2020" || value === "msfs2024";
}
function asNumber(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function snapshotFromStorage(value: unknown, session: Pick<AcarsSession, "id" | "pilotId" | "bookingId" | "simulator">): AcarsFlightSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<AcarsFlightSnapshot>;
  const latitude = asNumber(snapshot.latitude); const longitude = asNumber(snapshot.longitude);
  const altitudeFt = asNumber(snapshot.altitudeFt); const groundSpeedKt = asNumber(snapshot.groundSpeedKt); const headingDeg = asNumber(snapshot.headingDeg);
  if (latitude == null || longitude == null || altitudeFt == null || groundSpeedKt == null || headingDeg == null || typeof snapshot.timestamp !== "string") return null;
  return { simulator: session.simulator, sessionId: session.id, pilotId: session.pilotId, bookingId: session.bookingId, timestamp: snapshot.timestamp, latitude, longitude, altitudeFt, groundSpeedKt, headingDeg, fuelKg: asNumber(snapshot.fuelKg), enginesRunning: Boolean(snapshot.enginesRunning), parkingBrakeSet: Boolean(snapshot.parkingBrakeSet), onGround: Boolean(snapshot.onGround), verticalSpeedFpm: asNumber(snapshot.verticalSpeedFpm) };
}
function sessionFromRow(row: AcarsSessionRow): AcarsSession {
  if (!isSupportedSimulator(row.simulator)) throw new Error(`Unsupported ACARS simulator returned from storage: ${row.simulator}`);
  if (row.status !== "active" && row.status !== "completed" && row.status !== "disconnected") throw new Error(`Unsupported ACARS session status returned from storage: ${row.status}`);
  const base = { id: row.id, pilotId: row.pilot_id, bookingId: row.booking_id, simulator: row.simulator };
  const recentSnapshots = Array.isArray(row.recent_snapshots) ? row.recent_snapshots.map((snapshot) => snapshotFromStorage(snapshot, base)).filter((snapshot): snapshot is AcarsFlightSnapshot => snapshot != null) : [];
  return { id: row.id, pilotId: row.pilot_id, pilotNumber: row.pilot_number, pilotName: row.pilot_name, bookingId: row.booking_id, flightNumber: row.flight_number, from: row.departure_station, to: row.arrival_station, aircraft: row.aircraft, simulator: row.simulator, status: row.status, startedAt: row.started_at, updatedAt: row.updated_at, completedAt: row.completed_at, firstFuelKg: asNumber(row.first_fuel_kg), lastFuelKg: asNumber(row.last_fuel_kg), distanceNm: asNumber(row.distance_nm) ?? 0, landingFpm: asNumber(row.landing_fpm), lastSnapshot: snapshotFromStorage(row.last_snapshot, base), recentSnapshots };
}

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}
function localFallbackAllowed() { return process.env.NODE_ENV !== "production" || process.env.BAV_ACARS_LOCAL_FALLBACK === "1"; }
function requirePersistentClient() {
  const client = getSupabaseClient();
  if (client) return client;
  if (localFallbackAllowed()) return null;
  throw new Error("ACARS persistence is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY on the website host.");
}

async function readState(): Promise<State> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { const raw = await fs.readFile(FILE, "utf8"); const parsed = JSON.parse(raw) as Partial<State>; return { version: 1, sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; const state: State = { version: 1, sessions: [] }; await fs.writeFile(FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8"); return state; }
}
async function writeState(state: State) { await fs.mkdir(DATA_DIR, { recursive: true }); await fs.writeFile(FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8"); }
function haversineNm(a: AcarsFlightSnapshot, b: AcarsFlightSnapshot) {
  const toRad = (value: number) => value * Math.PI / 180; const earthNm = 3440.065;
  const dLat = toRad(b.latitude - a.latitude); const dLon = toRad(b.longitude - a.longitude); const lat1 = toRad(a.latitude); const lat2 = toRad(b.latitude);
  return 2 * earthNm * Math.asin(Math.sqrt(Math.min(1, Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2)));
}

async function startLocalAcarsSession(input: NewSessionInput) {
  const state = await readState(); for (const session of state.sessions) if (session.pilotId === input.pilotId && session.status === "active") session.status = "disconnected";
  const now = new Date().toISOString(); const session: AcarsSession = { ...input, id: randomUUID(), status: "active", startedAt: now, updatedAt: now, completedAt: null, firstFuelKg: null, lastFuelKg: null, distanceNm: 0, landingFpm: null, lastSnapshot: null, recentSnapshots: [] };
  state.sessions.push(session); await writeState(state); return session;
}
async function getLocalAcarsSession(id: string) { const state = await readState(); return state.sessions.find((session) => session.id === id) ?? null; }
async function getActiveLocalAcarsSessionForPilot(pilotId: string) { const state = await readState(); return state.sessions.filter((session) => session.pilotId === pilotId && session.status === "active").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null; }
async function appendLocalAcarsSnapshot(id: string, pilotId: string, snapshot: AcarsFlightSnapshot) {
  const state = await readState(); const session = state.sessions.find((item) => item.id === id && item.pilotId === pilotId); if (!session || session.status !== "active") return null;
  if (session.lastSnapshot) { const leg = haversineNm(session.lastSnapshot, snapshot); if (Number.isFinite(leg) && leg >= 0 && leg < 25) session.distanceNm += leg; }
  const recentSnapshots = session.recentSnapshots ?? (session.recentSnapshots = []); recentSnapshots.push(snapshot); if (recentSnapshots.length > MAX_RECENT_SNAPSHOTS) recentSnapshots.splice(0, recentSnapshots.length - MAX_RECENT_SNAPSHOTS);
  if (session.firstFuelKg == null && snapshot.fuelKg != null) session.firstFuelKg = snapshot.fuelKg; if (snapshot.fuelKg != null) session.lastFuelKg = snapshot.fuelKg;
  if (snapshot.onGround && snapshot.verticalSpeedFpm != null && snapshot.verticalSpeedFpm < -20) session.landingFpm = Math.round(snapshot.verticalSpeedFpm);
  session.lastSnapshot = snapshot; session.updatedAt = new Date().toISOString(); await writeState(state); return session;
}
async function completeLocalAcarsSession(id: string, pilotId: string, landingFpm?: number | null) {
  const state = await readState(); const session = state.sessions.find((item) => item.id === id && item.pilotId === pilotId); if (!session || session.status !== "active") return null;
  session.status = "completed"; session.completedAt = new Date().toISOString(); session.updatedAt = session.completedAt; if (landingFpm != null && Number.isFinite(landingFpm)) session.landingFpm = Math.round(landingFpm); await writeState(state); return session;
}
async function listLocalLiveAcarsSessions() { const state = await readState(); const cutoff = Date.now() - 90_000; return state.sessions.filter((session) => session.status === "active").map((session) => ({ ...session, connectionHealthy: new Date(session.updatedAt).getTime() >= cutoff })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }

async function startPersistentAcarsSession(client: SupabaseClient, input: NewSessionInput) {
  const now = new Date().toISOString(); const { error: disconnectError } = await client.from("acars_sessions").update({ status: "disconnected", updated_at: now }).eq("pilot_id", input.pilotId).eq("status", "active"); if (disconnectError) throw disconnectError;
  const { data, error } = await client.from("acars_sessions").insert({ id: randomUUID(), pilot_id: input.pilotId, pilot_number: input.pilotNumber, pilot_name: input.pilotName, booking_id: input.bookingId, flight_number: input.flightNumber, departure_station: input.from, arrival_station: input.to, aircraft: input.aircraft, simulator: input.simulator, status: "active", started_at: now, updated_at: now, completed_at: null, first_fuel_kg: null, last_fuel_kg: null, distance_nm: 0, landing_fpm: null, last_snapshot: null, recent_snapshots: [] }).select("*").single();
  if (error) throw error; return sessionFromRow(data as AcarsSessionRow);
}
async function getPersistentAcarsSession(client: SupabaseClient, id: string) { const { data, error } = await client.from("acars_sessions").select("*").eq("id", id).maybeSingle(); if (error) throw error; return data ? sessionFromRow(data as AcarsSessionRow) : null; }
async function getPersistentActiveAcarsSessionForPilot(client: SupabaseClient, pilotId: string) { const { data, error } = await client.from("acars_sessions").select("*").eq("pilot_id", pilotId).eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle(); if (error) throw error; return data ? sessionFromRow(data as AcarsSessionRow) : null; }
async function appendPersistentAcarsSnapshot(client: SupabaseClient, id: string, pilotId: string, snapshot: AcarsFlightSnapshot) {
  const session = await getPersistentAcarsSession(client, id); if (!session || session.pilotId !== pilotId || session.status !== "active") return null;
  let distanceNm = session.distanceNm; if (session.lastSnapshot) { const leg = haversineNm(session.lastSnapshot, snapshot); if (Number.isFinite(leg) && leg >= 0 && leg < 25) distanceNm += leg; }
  const recentSnapshots = [...(session.recentSnapshots ?? []), snapshot].slice(-MAX_RECENT_SNAPSHOTS); const now = new Date().toISOString();
  const { error: reportError } = await client.from("acars_position_reports").insert({ session_id: id, reported_at: snapshot.timestamp, latitude: snapshot.latitude, longitude: snapshot.longitude, altitude_ft: snapshot.altitudeFt, ground_speed_kt: snapshot.groundSpeedKt, heading_deg: snapshot.headingDeg, fuel_kg: snapshot.fuelKg, engines_running: snapshot.enginesRunning, parking_brake_set: snapshot.parkingBrakeSet, on_ground: snapshot.onGround, vertical_speed_fpm: snapshot.verticalSpeedFpm }); if (reportError) throw reportError;
  const { data, error } = await client.from("acars_sessions").update({ updated_at: now, first_fuel_kg: session.firstFuelKg ?? snapshot.fuelKg, last_fuel_kg: snapshot.fuelKg ?? session.lastFuelKg, distance_nm: distanceNm, landing_fpm: snapshot.onGround && snapshot.verticalSpeedFpm != null && snapshot.verticalSpeedFpm < -20 ? Math.round(snapshot.verticalSpeedFpm) : session.landingFpm, last_snapshot: snapshot, recent_snapshots: recentSnapshots }).eq("id", id).eq("pilot_id", pilotId).eq("status", "active").select("*").maybeSingle(); if (error) throw error; return data ? sessionFromRow(data as AcarsSessionRow) : null;
}
async function completePersistentAcarsSession(client: SupabaseClient, id: string, pilotId: string, landingFpm?: number | null) { const completedAt = new Date().toISOString(); const update: Record<string, unknown> = { status: "completed", completed_at: completedAt, updated_at: completedAt }; if (landingFpm != null && Number.isFinite(landingFpm)) update.landing_fpm = Math.round(landingFpm); const { data, error } = await client.from("acars_sessions").update(update).eq("id", id).eq("pilot_id", pilotId).eq("status", "active").select("*").maybeSingle(); if (error) throw error; return data ? sessionFromRow(data as AcarsSessionRow) : null; }
async function listPersistentLiveAcarsSessions(client: SupabaseClient) { const { data, error } = await client.from("acars_sessions").select("*").eq("status", "active").order("updated_at", { ascending: false }); if (error) throw error; const cutoff = Date.now() - 90_000; return (data as AcarsSessionRow[]).map(sessionFromRow).map((session) => ({ ...session, connectionHealthy: new Date(session.updatedAt).getTime() >= cutoff })); }

export async function startAcarsSession(input: NewSessionInput) { const client = requirePersistentClient(); return client ? startPersistentAcarsSession(client, input) : startLocalAcarsSession(input); }
export async function getAcarsSession(id: string) { const client = requirePersistentClient(); return client ? getPersistentAcarsSession(client, id) : getLocalAcarsSession(id); }
export async function getActiveAcarsSessionForPilot(pilotId: string) { const client = requirePersistentClient(); return client ? getPersistentActiveAcarsSessionForPilot(client, pilotId) : getActiveLocalAcarsSessionForPilot(pilotId); }
export async function appendAcarsSnapshot(id: string, pilotId: string, snapshot: AcarsFlightSnapshot) { const client = requirePersistentClient(); return client ? appendPersistentAcarsSnapshot(client, id, pilotId, snapshot) : appendLocalAcarsSnapshot(id, pilotId, snapshot); }
export async function completeAcarsSession(id: string, pilotId: string, landingFpm?: number | null) { const client = requirePersistentClient(); return client ? completePersistentAcarsSession(client, id, pilotId, landingFpm) : completeLocalAcarsSession(id, pilotId, landingFpm); }
export async function listLiveAcarsSessions() { const client = requirePersistentClient(); return client ? listPersistentLiveAcarsSessions(client) : listLocalLiveAcarsSessions(); }
