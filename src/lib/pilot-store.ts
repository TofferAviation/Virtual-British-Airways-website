import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { automaticPilotRank, isPilotRank, type PilotRank } from "@/lib/pilot-ranks";
import { normaliseStoredProfileImage, validateProfileImage } from "@/lib/profile-image";

const DATA_DIR = path.join(process.cwd(), ".bav-data");
const PILOT_FILE = path.join(DATA_DIR, "pilots.json");

type PilotState = {
  version: 4;
  nextPilotNumber: number;
  pilots: PilotAccount[];
  passwordResetTokens: PilotPasswordResetToken[];
  deviceSessions: PilotDeviceSession[];
};

type PilotPasswordResetToken = {
  pilotId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

/**
 * One revocable Ember device credential. The random credential itself is
 * never persisted: only its HMAC is stored in the server-side pilot state.
 */
type PilotDeviceSession = {
  id: string;
  pilotId: string;
  tokenHash: string;
  authVersion: number;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
};

type PilotStateRow = { state: unknown };

export type PilotAccount = {
  id: string;
  pilotNumber: string;
  email: string;
  name: string;
  passwordHash: string;
  /** Increments on password changes so previously issued sessions stop working. */
  authVersion: number;
  status: "active" | "suspended";
  createdAt: string;
  lastLoginAt: string | null;
  rank: PilotRank;
  rankOverride: PilotRank | null;
  hub: string;
  tier: string;
  points: number;
  tierPoints: number;
  lifetimeTierPoints: number;
  flights: number;
  hours: number;
  distanceNm: number;
  averageLanding: number | null;
  bestLanding: number | null;
  onTime: number;
  streak: number;
  /** Numeric SimBrief Pilot ID. This is not a password or an access token. */
  simbriefPilotId: string | null;
  /** Compact, user-selected account avatar stored as a data URL. */
  profileImage: string | null;
};

export type PublicPilotAccount = Omit<PilotAccount, "passwordHash" | "authVersion">;

function emptyState(): PilotState {
  return { version: 4, nextPilotNumber: 1, pilots: [], passwordResetTokens: [], deviceSessions: [] };
}

function getPilotStateClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function localFallbackAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.BAV_PILOT_LOCAL_FALLBACK === "1";
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalizePilot(raw: Partial<PilotAccount> & Pick<PilotAccount, "id" | "pilotNumber" | "email" | "name" | "passwordHash">): PilotAccount {
  const hours = Number.isFinite(raw.hours) ? Math.max(0, Number(raw.hours)) : 0;
  const rankOverride = isPilotRank(raw.rankOverride) ? raw.rankOverride : null;
  const rank = rankOverride ?? automaticPilotRank(hours);
  return {
    id: raw.id,
    pilotNumber: raw.pilotNumber,
    email: raw.email,
    name: raw.name,
    passwordHash: raw.passwordHash,
    authVersion: Math.max(1, Math.floor(Number(raw.authVersion) || 1)),
    status: raw.status === "suspended" ? "suspended" : "active",
    createdAt: raw.createdAt ?? new Date().toISOString(),
    lastLoginAt: raw.lastLoginAt ?? null,
    rank,
    rankOverride,
    hub: raw.hub ?? "London Heathrow",
    tier: raw.tier ?? "Blue",
    points: Number(raw.points) || 0,
    tierPoints: Number(raw.tierPoints) || 0,
    lifetimeTierPoints: Number(raw.lifetimeTierPoints) || 0,
    flights: Number(raw.flights) || 0,
    hours,
    distanceNm: Number(raw.distanceNm) || 0,
    averageLanding: raw.averageLanding ?? null,
    bestLanding: raw.bestLanding ?? null,
    onTime: Number.isFinite(raw.onTime) ? Number(raw.onTime) : 100,
    streak: Number(raw.streak) || 0,
    simbriefPilotId: normalizeSimbriefPilotId(raw.simbriefPilotId),
    profileImage: normaliseStoredProfileImage(raw.profileImage),
  };
}

function normalizeState(raw?: Partial<PilotState>): PilotState {
  const pilots = Array.isArray(raw?.pilots)
    ? raw.pilots
      .filter((pilot): pilot is PilotAccount => Boolean(pilot?.id && pilot?.pilotNumber && pilot?.email && pilot?.name && pilot?.passwordHash))
      .map((pilot) => normalizePilot(pilot))
    : [];
  const nextPilotNumber = Math.max(
    1,
    Number(raw?.nextPilotNumber) || 0,
    ...pilots.map((pilot) => Number(pilot.pilotNumber.replace(/\D/g, "")) + 1).filter(Number.isFinite),
  );
  const passwordResetTokens = Array.isArray(raw?.passwordResetTokens)
    ? raw.passwordResetTokens
      .filter((item): item is PilotPasswordResetToken => Boolean(
        item &&
          typeof item.pilotId === "string" &&
          typeof item.tokenHash === "string" &&
          typeof item.createdAt === "string" &&
          typeof item.expiresAt === "string",
      ))
      .map((item) => ({
        pilotId: item.pilotId,
        tokenHash: item.tokenHash,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        usedAt: typeof item.usedAt === "string" ? item.usedAt : null,
      }))
      .filter((item) => pilots.some((pilot) => pilot.id === item.pilotId))
      .slice(-1000)
    : [];
  const now = Date.now();
  const deviceSessions = Array.isArray(raw?.deviceSessions)
    ? raw.deviceSessions
      .filter((item): item is PilotDeviceSession => Boolean(
        item &&
          typeof item.id === "string" &&
          typeof item.pilotId === "string" &&
          typeof item.tokenHash === "string" &&
          typeof item.createdAt === "string" &&
          typeof item.expiresAt === "string",
      ))
      .map((item) => ({
        id: item.id,
        pilotId: item.pilotId,
        tokenHash: item.tokenHash,
        authVersion: Math.max(1, Math.floor(Number(item.authVersion) || 1)),
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        lastUsedAt: typeof item.lastUsedAt === "string" ? item.lastUsedAt : item.createdAt,
        revokedAt: typeof item.revokedAt === "string" ? item.revokedAt : null,
      }))
      .filter((item) => {
        const expiration = Date.parse(item.expiresAt);
        return pilots.some((pilot) => pilot.id === item.pilotId) && Number.isFinite(expiration) && expiration > now;
      })
      .slice(-2_000)
    : [];
  return { version: 4, nextPilotNumber, pilots, passwordResetTokens, deviceSessions };
}

async function readLocalState(): Promise<PilotState> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(PILOT_FILE, "utf8");
    return normalizeState(JSON.parse(raw) as Partial<PilotState>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return emptyState();
  }
}

async function writeLocalState(state: PilotState) {
  await ensureDataDir();
  await fs.writeFile(PILOT_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function readState(): Promise<PilotState> {
  const client = getPilotStateClient();
  if (client) {
    const { data, error } = await client.from("pilot_state").select("state").eq("singleton", true).maybeSingle();
    if (error) throw error;
    if (data?.state) return normalizeState((data as PilotStateRow).state as Partial<PilotState>);

    // A one-time local import is permitted only when explicitly enabled. It
    // supports moving the existing development state into Supabase without
    // allowing an ephemeral production instance to become authoritative.
    const initial = localFallbackAllowed() ? await readLocalState() : emptyState();
    const { error: createError } = await client.from("pilot_state").upsert({ singleton: true, state: initial });
    if (createError) throw createError;
    return initial;
  }
  if (!localFallbackAllowed()) {
    throw new Error("Pilot account persistence is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY on the website host.");
  }
  return readLocalState();
}

async function writeState(state: PilotState) {
  const normalized = normalizeState(state);
  const client = getPilotStateClient();
  if (client) {
    const { error } = await client.from("pilot_state").upsert({ singleton: true, state: normalized });
    if (error) throw error;
    return;
  }
  if (!localFallbackAllowed()) {
    throw new Error("Pilot account persistence is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY on the website host.");
  }
  await writeLocalState(normalized);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashPilotPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPilotPassword(password: string, stored: string) {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  try {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function registerPilot(input: { name: string; email: string; password: string }) {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  const email = normalizeEmail(input.email);
  const password = input.password;
  if (name.length < 2) throw new Error("Please enter your full name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
  if (password.length < 8) throw new Error("Password must contain at least 8 characters.");

  const state = await readState();
  if (state.pilots.some((pilot) => pilot.email === email)) throw new Error("An account already exists for that email address.");

  const pilotNumber = `BAWVA${String(state.nextPilotNumber).padStart(4, "0")}`;
  const now = new Date().toISOString();
  const account: PilotAccount = {
    id: randomUUID(), pilotNumber, email, name, passwordHash: hashPilotPassword(password), status: "active",
    authVersion: 1,
    createdAt: now, lastLoginAt: now, rank: "Second Officer", rankOverride: null, hub: "London Heathrow", tier: "Blue",
    points: 0, tierPoints: 0, lifetimeTierPoints: 0, flights: 0, hours: 0, distanceNm: 0,
    averageLanding: null, bestLanding: null, onTime: 100, streak: 0,
    simbriefPilotId: null,
    profileImage: null,
  };
  state.nextPilotNumber += 1;
  state.pilots.push(account);
  await writeState(state);
  return account;
}

export async function findPilotByEmail(email: string) {
  const state = await readState();
  return state.pilots.find((pilot) => pilot.email === normalizeEmail(email)) ?? null;
}

export async function getPilotById(id: string) {
  const state = await readState();
  return state.pilots.find((pilot) => pilot.id === id) ?? null;
}

const ACARS_DEVICE_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function acarsDeviceSessionSecret() {
  const value = process.env.BAV_ACARS_SECRET || process.env.BAV_PILOT_SESSION_SECRET || process.env.BAV_STAFF_SESSION_SECRET;
  if (!value || value.length < 24) throw new Error("BAV_ACARS_SECRET or BAV_PILOT_SESSION_SECRET must be at least 24 characters long.");
  return value;
}

function hashAcarsDeviceSessionToken(token: string) {
  return createHmac("sha256", acarsDeviceSessionSecret()).update(token).digest("hex");
}

function revokePilotDeviceSessions(state: PilotState, pilotId: string, now = new Date().toISOString()) {
  for (const session of state.deviceSessions) {
    if (session.pilotId === pilotId && session.revokedAt === null) session.revokedAt = now;
  }
}

function activeDeviceSession(state: PilotState, token: string, now = Date.now()) {
  const tokenHash = hashAcarsDeviceSessionToken(token);
  return state.deviceSessions.find((session) =>
    session.tokenHash === tokenHash &&
    session.revokedAt === null &&
    Date.parse(session.expiresAt) > now,
  ) ?? null;
}

/** Creates a per-device Ember session and persists only a non-reversible HMAC. */
export async function createAcarsDeviceSession(pilotId: string) {
  const state = await readState();
  const pilot = state.pilots.find((item) => item.id === pilotId && item.status === "active");
  if (!pilot) return null;

  const rawToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const session: PilotDeviceSession = {
    id: randomUUID(),
    pilotId: pilot.id,
    tokenHash: hashAcarsDeviceSessionToken(rawToken),
    authVersion: pilot.authVersion,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ACARS_DEVICE_SESSION_TTL_MS).toISOString(),
    lastUsedAt: now.toISOString(),
    revokedAt: null,
  };
  state.deviceSessions.push(session);
  await writeState(state);
  return { id: session.id, token: rawToken };
}

/** Validates and rotates a device credential, invalidating its previous value. */
export async function renewAcarsDeviceSession(token: string) {
  if (!/^[A-Za-z0-9_-]{40,120}$/.test(token)) return null;
  const state = await readState();
  const session = activeDeviceSession(state, token);
  if (!session) return null;
  const pilot = state.pilots.find((item) => item.id === session.pilotId && item.status === "active");
  if (!pilot || session.authVersion !== pilot.authVersion) return null;

  const nextToken = randomBytes(32).toString("base64url");
  session.tokenHash = hashAcarsDeviceSessionToken(nextToken);
  const now = new Date();
  session.lastUsedAt = now.toISOString();
  session.expiresAt = new Date(now.getTime() + ACARS_DEVICE_SESSION_TTL_MS).toISOString();
  await writeState(state);
  return { pilot, id: session.id, token: nextToken };
}

/** Checks that an access token's backing device session remains active. */
export async function isAcarsDeviceSessionActive(input: { id: string; pilotId: string; authVersion: number }) {
  const state = await readState();
  const session = state.deviceSessions.find((item) => item.id === input.id);
  return Boolean(
    session &&
    session.pilotId === input.pilotId &&
    session.authVersion === input.authVersion &&
    session.revokedAt === null &&
    Date.parse(session.expiresAt) > Date.now(),
  );
}

/** Revokes one device credential. It is safe to call repeatedly. */
export async function revokeAcarsDeviceSession(token: string) {
  if (!/^[A-Za-z0-9_-]{40,120}$/.test(token)) return false;
  const state = await readState();
  const session = activeDeviceSession(state, token);
  if (!session) return false;
  session.revokedAt = new Date().toISOString();
  await writeState(state);
  return true;
}

export async function listPilots() {
  const state = await readState();
  return state.pilots.map(toPublicPilot).sort((a, b) => a.pilotNumber.localeCompare(b.pilotNumber));
}

export async function markPilotLogin(id: string) {
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) return;
  account.lastLoginAt = new Date().toISOString();
  await writeState(state);
}

export async function updatePilotProfile(id: string, input: { name: string; email: string; profileImage?: string | null }) {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  const email = normalizeEmail(input.email);
  if (name.length < 2) throw new Error("Please enter your full name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  if (state.pilots.some((pilot) => pilot.id !== id && pilot.email === email)) throw new Error("That email address is already in use.");
  account.name = name;
  account.email = email;
  if (input.profileImage !== undefined) account.profileImage = validateProfileImage(input.profileImage);
  await writeState(state);
  return toPublicPilot(account);
}

function normalizeSimbriefPilotId(value: unknown) {
  const id = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return /^\d{1,12}$/.test(id) ? id : null;
}

export async function updatePilotSimbriefId(id: string, simbriefPilotId: string) {
  const normalized = normalizeSimbriefPilotId(simbriefPilotId);
  if (simbriefPilotId.trim() && !normalized) throw new Error("Enter your numeric SimBrief Pilot ID, or leave it blank to remove the link.");
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  account.simbriefPilotId = normalized;
  await writeState(state);
  return toPublicPilot(account);
}

export async function changePilotPassword(id: string, currentPassword: string, newPassword: string) {
  if (newPassword.length < 8) throw new Error("New password must contain at least 8 characters.");
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  if (!verifyPilotPassword(currentPassword, account.passwordHash)) throw new Error("Your current password is incorrect.");
  account.passwordHash = hashPilotPassword(newPassword);
  account.authVersion += 1;
  revokePilotDeviceSessions(state, account.id);
  await writeState(state);
}

function passwordResetSecret() {
  const secret = (process.env.BAV_PASSWORD_RESET_SECRET ?? process.env.BAV_PILOT_SESSION_SECRET ?? "").trim();
  if (secret.length < 32) throw new Error("Password-reset security is not configured on this server.");
  return secret;
}

function hashPasswordResetToken(token: string) {
  return createHmac("sha256", passwordResetSecret()).update(token).digest("hex");
}

function removeExpiredResetTokens(state: PilotState, now = Date.now()) {
  state.passwordResetTokens = state.passwordResetTokens.filter((item) => {
    const expiresAt = Date.parse(item.expiresAt);
    return Number.isFinite(expiresAt) && (item.usedAt === null ? expiresAt > now : now - expiresAt < 24 * 60 * 60 * 1000);
  });
}

/**
 * Creates a single-use reset token without ever persisting the token itself.
 * The caller must treat the returned token as secret and send it directly to
 * the verified pilot email address.
 */
export async function createPilotPasswordReset(email: string) {
  const state = await readState();
  const pilot = state.pilots.find((item) => item.email === normalizeEmail(email) && item.status === "active");
  if (!pilot) return null;

  const now = Date.now();
  removeExpiredResetTokens(state, now);
  const latest = state.passwordResetTokens
    .filter((item) => item.pilotId === pilot.id && item.usedAt === null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (latest && now - Date.parse(latest.createdAt) < 60_000) {
    // Avoid issuing a stream of replacement links while keeping the public
    // endpoint response identical for known and unknown addresses.
    return null;
  }

  state.passwordResetTokens = state.passwordResetTokens.filter((item) => item.pilotId !== pilot.id || item.usedAt !== null);
  const token = randomBytes(32).toString("base64url");
  state.passwordResetTokens.push({
    pilotId: pilot.id,
    tokenHash: hashPasswordResetToken(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    usedAt: null,
  });
  await writeState(state);
  return { pilot, token };
}

export async function resetPilotPassword(token: string, newPassword: string) {
  if (newPassword.length < 10) throw new Error("Use a password with at least 10 characters.");
  if (!/^[A-Za-z0-9_-]{40,120}$/.test(token)) throw new Error("This password-reset link is invalid or has expired.");

  const state = await readState();
  const now = Date.now();
  removeExpiredResetTokens(state, now);
  const tokenHash = hashPasswordResetToken(token);
  const reset = state.passwordResetTokens.find((item) => item.tokenHash === tokenHash && item.usedAt === null && Date.parse(item.expiresAt) > now);
  if (!reset) {
    await writeState(state);
    throw new Error("This password-reset link is invalid or has expired.");
  }

  const pilot = state.pilots.find((item) => item.id === reset.pilotId && item.status === "active");
  if (!pilot) throw new Error("This password-reset link is invalid or has expired.");

  pilot.passwordHash = hashPilotPassword(newPassword);
  pilot.authVersion += 1;
  revokePilotDeviceSessions(state, pilot.id);
  reset.usedAt = new Date(now).toISOString();
  state.passwordResetTokens = state.passwordResetTokens.filter((item) => item.pilotId !== pilot.id || item === reset);
  await writeState(state);
  return toPublicPilot(pilot);
}

export async function setPilotStatus(id: string, status: PilotAccount["status"]) {
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  account.status = status;
  if (status === "suspended") revokePilotDeviceSessions(state, account.id);
  await writeState(state);
  return toPublicPilot(account);
}

export async function updatePilotAdminFields(id: string, input: { rankOverride?: PilotRank | null; hub?: string; tier?: string }) {
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  if (input.rankOverride !== undefined) {
    account.rankOverride = input.rankOverride;
    account.rank = input.rankOverride ?? automaticPilotRank(account.hours);
  }
  if (input.hub) account.hub = input.hub.trim().slice(0, 60);
  if (input.tier) account.tier = input.tier.trim().slice(0, 30);
  await writeState(state);
  return toPublicPilot(account);
}

export async function applyApprovedPirepStats(pilotId: string, input: { blockMinutes: number; distanceNm: number; landingFpm: number | null; points: number; tierPoints: number }) {
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === pilotId);
  if (!account) throw new Error("Pilot not found.");
  const previousFlights = account.flights;
  account.flights += 1;
  account.hours = Math.round((account.hours + input.blockMinutes / 60) * 100) / 100;
  account.distanceNm += Math.max(0, Math.round(input.distanceNm));
  account.points += Math.max(0, input.points);
  account.tierPoints += Math.max(0, input.tierPoints);
  account.lifetimeTierPoints += Math.max(0, input.tierPoints);
  account.streak += 1;
  if (input.landingFpm != null) {
    account.averageLanding = account.averageLanding == null ? input.landingFpm : Math.round((account.averageLanding * previousFlights + input.landingFpm) / Math.max(1, account.flights));
    account.bestLanding = account.bestLanding == null ? input.landingFpm : Math.max(account.bestLanding, input.landingFpm);
  }
  account.rank = account.rankOverride ?? automaticPilotRank(account.hours);
  if (account.tierPoints >= 3500) account.tier = "Gold";
  else if (account.tierPoints >= 1500) account.tier = "Silver";
  else if (account.tierPoints >= 500) account.tier = "Bronze";
  await writeState(state);
  return account;
}

export function toPublicPilot(account: PilotAccount): PublicPilotAccount {
  const { passwordHash: _passwordHash, authVersion: _authVersion, ...pilot } = account;
  void _passwordHash;
  void _authVersion;
  return pilot;
}
