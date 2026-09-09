import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".bav-data");
const PILOT_FILE = path.join(DATA_DIR, "pilots.json");

type PilotState = {
  version: 1;
  nextPilotNumber: number;
  pilots: PilotAccount[];
};

export type PilotAccount = {
  id: string;
  pilotNumber: string;
  email: string;
  name: string;
  passwordHash: string;
  status: "active" | "suspended";
  createdAt: string;
  lastLoginAt: string | null;
  rank: string;
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
};

export type PublicPilotAccount = Omit<PilotAccount, "passwordHash">;

function emptyState(): PilotState {
  return { version: 1, nextPilotNumber: 1, pilots: [] };
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readState(): Promise<PilotState> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(PILOT_FILE, "utf8");
    const parsed = JSON.parse(raw) as PilotState;
    return {
      version: 1,
      nextPilotNumber: Math.max(1, Number(parsed.nextPilotNumber) || 1),
      pilots: Array.isArray(parsed.pilots) ? parsed.pilots : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const state = emptyState();
    await writeState(state);
    return state;
  }
}

async function writeState(state: PilotState) {
  await ensureDataDir();
  await fs.writeFile(PILOT_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
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
  if (state.pilots.some((pilot) => pilot.email === email)) {
    throw new Error("An account already exists for that email address.");
  }

  const pilotNumber = `BAWVA${String(state.nextPilotNumber).padStart(4, "0")}`;
  const now = new Date().toISOString();
  const account: PilotAccount = {
    id: randomUUID(),
    pilotNumber,
    email,
    name,
    passwordHash: hashPilotPassword(password),
    status: "active",
    createdAt: now,
    lastLoginAt: now,
    rank: "Cadet",
    hub: "London Heathrow",
    tier: "Blue",
    points: 0,
    tierPoints: 0,
    lifetimeTierPoints: 0,
    flights: 0,
    hours: 0,
    distanceNm: 0,
    averageLanding: null,
    bestLanding: null,
    onTime: 100,
    streak: 0,
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

export async function markPilotLogin(id: string) {
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) return;
  account.lastLoginAt = new Date().toISOString();
  await writeState(state);
}

export function toPublicPilot(account: PilotAccount): PublicPilotAccount {
  const { passwordHash: _passwordHash, ...pilot } = account;
  void _passwordHash;
  return pilot;
}
