import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type TicketStatus = "open" | "in_progress" | "waiting_for_pilot" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketCategory = "account" | "flight" | "website" | "events" | "technical" | "other";

export type TicketAttachment = { id: string; name: string; href: string; size: number };
export type TicketMessage = {
  id: string;
  authorType: "pilot" | "staff";
  authorId: string;
  authorName: string;
  body: string;
  internal: boolean;
  createdAt: string;
  attachments: TicketAttachment[];
};

export type SupportTicket = {
  id: string;
  number: string;
  pilotId: string;
  pilotName: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  messages: TicketMessage[];
};

type TicketState = { nextNumber: number; tickets: SupportTicket[] };
const DATA_DIR = path.join(process.cwd(), ".bav-data");
const DATA_FILE = path.join(DATA_DIR, "tickets.json");
const DEFAULT_STATE: TicketState = { nextNumber: 1001, tickets: [] };

async function ensureState() {
  await mkdir(DATA_DIR, { recursive: true });
  try {
    await readFile(DATA_FILE, "utf8");
  } catch {
    await writeFile(DATA_FILE, JSON.stringify(DEFAULT_STATE, null, 2), "utf8");
  }
}

export async function getTicketState(): Promise<TicketState> {
  await ensureState();
  try {
    const parsed = JSON.parse(await readFile(DATA_FILE, "utf8")) as TicketState;
    return {
      nextNumber: Number.isFinite(parsed.nextNumber) ? parsed.nextNumber : 1001,
      tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

async function saveTicketState(state: TicketState) {
  await mkdir(DATA_DIR, { recursive: true });
  const temp = `${DATA_FILE}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2), "utf8");
  await rename(temp, DATA_FILE);
}

export async function listPilotTickets(pilotId: string) {
  const state = await getTicketState();
  return state.tickets
    .filter((ticket) => ticket.pilotId === pilotId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listAllTickets() {
  const state = await getTicketState();
  return [...state.tickets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getTicket(id: string) {
  const state = await getTicketState();
  return state.tickets.find((ticket) => ticket.id === id || ticket.number.toLowerCase() === id.toLowerCase()) ?? null;
}

export async function createTicket(input: {
  pilotId: string;
  pilotName: string;
  subject: string;
  category: TicketCategory;
  priority?: TicketPriority;
  body: string;
  attachments?: TicketAttachment[];
}) {
  const state = await getTicketState();
  const now = new Date().toISOString();
  const ticket: SupportTicket = {
    id: randomUUID(),
    number: `BAV-${state.nextNumber}`,
    pilotId: input.pilotId,
    pilotName: input.pilotName,
    subject: input.subject.trim(),
    category: input.category,
    status: "open",
    priority: input.priority ?? "normal",
    assignedStaffId: null,
    assignedStaffName: null,
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    messages: [{
      id: randomUUID(),
      authorType: "pilot",
      authorId: input.pilotId,
      authorName: input.pilotName,
      body: input.body.trim(),
      internal: false,
      createdAt: now,
      attachments: input.attachments ?? [],
    }],
  };
  state.nextNumber += 1;
  state.tickets.push(ticket);
  await saveTicketState(state);
  return ticket;
}

export async function addTicketMessage(ticketId: string, message: Omit<TicketMessage, "id" | "createdAt">) {
  const state = await getTicketState();
  const ticket = state.tickets.find((item) => item.id === ticketId);
  if (!ticket) return null;
  const now = new Date().toISOString();
  ticket.messages.push({ ...message, id: randomUUID(), createdAt: now });
  ticket.updatedAt = now;
  if (message.authorType === "pilot" && ticket.status === "waiting_for_pilot") ticket.status = "open";
  if (message.authorType === "staff" && !message.internal && ticket.status === "open") ticket.status = "waiting_for_pilot";
  await saveTicketState(state);
  return ticket;
}

export async function updateTicket(ticketId: string, patch: Partial<Pick<SupportTicket, "status" | "priority" | "assignedStaffId" | "assignedStaffName">>) {
  const state = await getTicketState();
  const ticket = state.tickets.find((item) => item.id === ticketId);
  if (!ticket) return null;
  Object.assign(ticket, patch);
  ticket.updatedAt = new Date().toISOString();
  ticket.closedAt = ticket.status === "closed" ? ticket.updatedAt : null;
  await saveTicketState(state);
  return ticket;
}

export async function saveTicketAttachments(ticketNumber: string, files: File[]) {
  const usable = files.filter((file) => file.size > 0).slice(0, 5);
  if (!usable.length) return [] as TicketAttachment[];
  const publicDir = path.join(process.cwd(), "public", "uploads", "tickets", ticketNumber.toLowerCase());
  await mkdir(publicDir, { recursive: true });
  const attachments: TicketAttachment[] = [];
  for (const file of usable) {
    if (file.size > 8 * 1024 * 1024) continue;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "attachment";
    const storedName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
    await writeFile(path.join(publicDir, storedName), Buffer.from(await file.arrayBuffer()));
    attachments.push({ id: randomUUID(), name: file.name, href: `/uploads/tickets/${ticketNumber.toLowerCase()}/${storedName}`, size: file.size });
  }
  return attachments;
}
