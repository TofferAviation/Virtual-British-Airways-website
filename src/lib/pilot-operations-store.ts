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
  routeId: string | null;
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

export type PilotFlightPlan = {
  id: string;
  bookingId: string;
  pilotId: string;
  status: "draft" | "dispatch_opened" | "synced" | "sync_failed";
  simbriefPilotId: string | null;
  simbriefDispatchUrl: string | null;
  simbriefOfpId: string | null;
  simbriefOfpUrl: string | null;
  route: string | null;
  cruiseAltitude: string | null;
  alternate: string | null;
  generatedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  version: 4;
  bookings: PilotBooking[];
  flightPlans: PilotFlightPlan[];
  pireps: PilotPirep[];
};

function normalizeBooking(booking: PilotBooking): PilotBooking {
  return { ...booking, routeId: booking.routeId ?? null };
}

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
    const parsed = JSON.parse(raw) as { bookings?: PilotBooking[]; flightPlans?: PilotFlightPlan[]; pireps?: PilotPirep[] };
    return {
      version: 4,
      bookings: Array.isArray(parsed.bookings) ? parsed.bookings.map(normalizeBooking) : [],
      flightPlans: Array.isArray(parsed.flightPlans) ? parsed.flightPlans : [],
      pireps: Array.isArray(parsed.pireps) ? parsed.pireps.map((item) => normalizePirep(item)) : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const state: OperationsState = { version: 4, bookings: [], flightPlans: [], pireps: [] };
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

export async function createFlightPlanForBooking(input: { bookingId: string; pilotId: string; simbriefPilotId: string | null; simbriefDispatchUrl: string | null }) {
  const state = await readState();
  const booking = state.bookings.find((item) => item.id === input.bookingId && item.pilotId === input.pilotId);
  if (!booking) throw new Error("Flight assignment not found.");
  const existing = state.flightPlans.find((item) => item.bookingId === input.bookingId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const flightPlan: PilotFlightPlan = { id: randomUUID(), bookingId: input.bookingId, pilotId: input.pilotId, status: "draft", simbriefPilotId: input.simbriefPilotId, simbriefDispatchUrl: input.simbriefDispatchUrl, simbriefOfpId: null, simbriefOfpUrl: null, route: null, cruiseAltitude: null, alternate: null, generatedAt: null, lastSyncedAt: null, createdAt: now, updatedAt: now };
  state.flightPlans.push(flightPlan);
  await writeState(state);
  return flightPlan;
}

export async function getPilotFlightPlan(bookingId: string, pilotId: string) {
  const state = await readState();
  return state.flightPlans.find((item) => item.bookingId === bookingId && item.pilotId === pilotId) ?? null;
}

export async function markFlightPlanDispatchOpened(bookingId: string, pilotId: string) {
  const state = await readState();
  const flightPlan = state.flightPlans.find((item) => item.bookingId === bookingId && item.pilotId === pilotId);
  if (!flightPlan) throw new Error("Flight plan not found.");
  flightPlan.status = "dispatch_opened";
  flightPlan.updatedAt = new Date().toISOString();
  await writeState(state);
  return flightPlan;
}

export async function configureFlightPlanSimbrief(input: { bookingId: string; pilotId: string; simbriefPilotId: string; simbriefDispatchUrl: string }) {
  const state = await readState();
  const flightPlan = state.flightPlans.find((item) => item.bookingId === input.bookingId && item.pilotId === input.pilotId);
  if (!flightPlan) throw new Error("Flight plan not found.");
  flightPlan.simbriefPilotId = input.simbriefPilotId;
  flightPlan.simbriefDispatchUrl = input.simbriefDispatchUrl;
  flightPlan.updatedAt = new Date().toISOString();
  await writeState(state);
  return flightPlan;
}

export async function updateFlightPlanFromSimbrief(input: { bookingId: string; pilotId: string; status: PilotFlightPlan["status"]; simbriefOfpId?: string | null; simbriefOfpUrl?: string | null; route?: string | null; cruiseAltitude?: string | null; alternate?: string | null; generatedAt?: string | null }) {
  const state = await readState();
  const flightPlan = state.flightPlans.find((item) => item.bookingId === input.bookingId && item.pilotId === input.pilotId);
  if (!flightPlan) throw new Error("Flight plan not found.");
  flightPlan.status = input.status;
  if (input.simbriefOfpId !== undefined) flightPlan.simbriefOfpId = input.simbriefOfpId;
  if (input.simbriefOfpUrl !== undefined) flightPlan.simbriefOfpUrl = input.simbriefOfpUrl;
  if (input.route !== undefined) flightPlan.route = input.route;
  if (input.cruiseAltitude !== undefined) flightPlan.cruiseAltitude = input.cruiseAltitude;
  if (input.alternate !== undefined) flightPlan.alternate = input.alternate;
  if (input.generatedAt !== undefined) flightPlan.generatedAt = input.generatedAt;
  flightPlan.lastSyncedAt = new Date().toISOString();
  flightPlan.updatedAt = new Date().toISOString();
  await writeState(state);
  return flightPlan;
}

export async function getPilotBooking(bookingId: string, pilotId: string) {
  const state = await readState();
  return state.bookings.find((item) => item.id === bookingId && item.pilotId === pilotId) ?? null;
}

export async function getActivePilotBooking(pilotId: string) {
  const state = await readState();
  return [...state.bookings].reverse().find((booking) => booking.pilotId === pilotId && ["booked", "in_progress"].includes(booking.status)) ?? null;
}

export async function listPilotBookings(pilotId: string) {
  const state = await readState();
  return state.bookings.filter((booking) => booking.pilotId === pilotId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function countActiveScheduleBookings(routeId: string, date: string) {
  const state = await readState();
  return state.bookings.filter((booking) => booking.routeId === routeId && booking.date === date && ["booked", "in_progress"].includes(booking.status)).length;
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
