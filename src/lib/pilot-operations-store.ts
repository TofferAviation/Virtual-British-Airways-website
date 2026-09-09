import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SupportedSimulator } from "@/lib/acars-contract";
import { applyApprovedPirepStats } from "@/lib/pilot-store";

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

export type PirepStatus = "pending" | "changes_requested" | "accepted" | "rejected";

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
  tierPointsAwarded: number;
  status: PirepStatus;
  source: "manual" | "acars";
  simulator: SupportedSimulator;
  acarsSessionId: string | null;
  pilotComments: string;
  staffComments: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
};

type OperationsState = {
  version: 2;
  bookings: PilotBooking[];
  pireps: PilotPirep[];
};

function normalizePirep(pirep: Partial<PilotPirep> & Pick<PilotPirep, "id" | "pilotId" | "flightNumber" | "from" | "to" | "aircraft" | "startedAt" | "completedAt" | "blockMinutes" | "distanceNm">): PilotPirep {
  return {
    bookingId: null,
    landingFpm: null,
    fuelUsedKg: null,
    pointsAwarded: 0,
    tierPointsAwarded: 0,
    status: "pending",
    source: "manual",
    simulator: "xplane12",
    acarsSessionId: null,
    pilotComments: "",
    staffComments: "",
    reviewedAt: null,
    reviewedBy: null,
    createdAt: pirep.completedAt,
    ...pirep,
  };
}

async function readState(): Promise<OperationsState> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as { bookings?: PilotBooking[]; pireps?: PilotPirep[] };
    return {
      version: 2,
      bookings: Array.isArray(parsed.bookings) ? parsed.bookings : [],
      pireps: Array.isArray(parsed.pireps) ? parsed.pireps.map((item) => normalizePirep(item)) : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const state: OperationsState = { version: 2, bookings: [], pireps: [] };
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
  return state.pireps.filter((pirep) => pirep.pilotId === pilotId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAllPireps() {
  const state = await readState();
  return [...state.pireps].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPirep(id: string) {
  const state = await readState();
  return state.pireps.find((pirep) => pirep.id === id) ?? null;
}

export async function cancelActivePilotBooking(pilotId: string) {
  const state = await readState();
  const booking = [...state.bookings].reverse().find((item) => item.pilotId === pilotId && ["booked", "in_progress"].includes(item.status));
  if (!booking) return null;
  booking.status = "cancelled";
  await writeState(state);
  return booking;
}

export async function recordPilotPirep(input: Omit<PilotPirep, "id" | "createdAt" | "reviewedAt" | "reviewedBy" | "staffComments" | "pointsAwarded" | "tierPointsAwarded">) {
  const state = await readState();
  const pirep: PilotPirep = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    staffComments: "",
    pointsAwarded: 0,
    tierPointsAwarded: 0,
  };
  state.pireps.push(pirep);
  const booking = input.bookingId ? state.bookings.find((item) => item.id === input.bookingId) : null;
  if (booking) booking.status = "completed";
  await writeState(state);
  return pirep;
}

export async function reviewPirep(input: { id: string; decision: "accepted" | "rejected" | "changes_requested"; staffName: string; comments: string }) {
  const state = await readState();
  const pirep = state.pireps.find((item) => item.id === input.id);
  if (!pirep) throw new Error("PIREP not found.");
  if (pirep.status === "accepted") throw new Error("Accepted PIREPs cannot be reviewed twice.");

  pirep.status = input.decision;
  pirep.staffComments = input.comments.trim().slice(0, 2000);
  pirep.reviewedAt = new Date().toISOString();
  pirep.reviewedBy = input.staffName;

  if (input.decision === "accepted") {
    const points = Math.max(25, Math.round(pirep.blockMinutes / 5 + pirep.distanceNm / 50));
    const tierPoints = Math.max(5, Math.round(points * 0.4));
    pirep.pointsAwarded = points;
    pirep.tierPointsAwarded = tierPoints;
    await applyApprovedPirepStats(pirep.pilotId, {
      blockMinutes: pirep.blockMinutes,
      distanceNm: pirep.distanceNm,
      landingFpm: pirep.landingFpm,
      points,
      tierPoints,
    });
  }

  await writeState(state);
  return pirep;
}
