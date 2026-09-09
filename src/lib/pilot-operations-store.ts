import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".bav-data");
const FILE = path.join(DATA_DIR, "pilot-operations.json");

export type PilotBooking = {
  id: string;
  pilotId: string;
  flightNumber: string;
  from: string;
  to: string;
  aircraft: string;
  departure: string;
  arrival: string;
  duration: string;
  date: string;
  status: "booked" | "in_progress" | "completed" | "cancelled";
  createdAt: string;
};

export type PilotPirep = {
  id: string;
  pilotId: string;
  bookingId: string | null;
  flightNumber: string;
  from: string;
  to: string;
  aircraft: string;
  startedAt: string;
  completedAt: string;
  blockMinutes: number;
  distanceNm: number;
  landingFpm: number | null;
  fuelUsedKg: number | null;
  pointsAwarded: number;
  status: "pending" | "accepted" | "rejected";
  source: "manual" | "acars";
  acarsSessionId: string | null;
};

type OperationsState = {
  version: 1;
  bookings: PilotBooking[];
  pireps: PilotPirep[];
};

async function readState(): Promise<OperationsState> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const state = JSON.parse(raw) as OperationsState;
    return { version: 1, bookings: Array.isArray(state.bookings) ? state.bookings : [], pireps: Array.isArray(state.pireps) ? state.pireps : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const state: OperationsState = { version: 1, bookings: [], pireps: [] };
    await fs.writeFile(FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    return state;
  }
}

async function writeState(state: OperationsState) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function createPilotBooking(input: Omit<PilotBooking, "id" | "createdAt" | "status">) {
  const state = await readState();
  for (const booking of state.bookings) {
    if (booking.pilotId === input.pilotId && ["booked", "in_progress"].includes(booking.status)) booking.status = "cancelled";
  }
  const booking: PilotBooking = { ...input, id: randomUUID(), createdAt: new Date().toISOString(), status: "booked" };
  state.bookings.push(booking);
  await writeState(state);
  return booking;
}

export async function getActivePilotBooking(pilotId: string) {
  const state = await readState();
  return [...state.bookings].reverse().find((booking) => booking.pilotId === pilotId && ["booked", "in_progress"].includes(booking.status)) ?? null;
}

export async function listPilotBookings(pilotId: string) {
  const state = await readState();
  return state.bookings.filter((booking) => booking.pilotId === pilotId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listPilotPireps(pilotId: string) {
  const state = await readState();
  return state.pireps.filter((pirep) => pirep.pilotId === pilotId).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

// FreeFlight ACARS will write through this boundary later. Keeping the storage API
// simulator-agnostic means the website does not need to change when live tracking arrives.
export async function recordPilotPirep(input: Omit<PilotPirep, "id">) {
  const state = await readState();
  const pirep: PilotPirep = { ...input, id: randomUUID() };
  state.pireps.push(pirep);
  const booking = input.bookingId ? state.bookings.find((item) => item.id === input.bookingId) : null;
  if (booking) booking.status = "completed";
  await writeState(state);
  return pirep;
}
