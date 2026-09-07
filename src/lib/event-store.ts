import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { virtualEvents, type VirtualEvent } from "@/data/events";

const dataDir = path.join(process.cwd(), ".bav-data");
const eventsFile = path.join(dataDir, "events.json");

function sortEvents(events: VirtualEvent[]) {
  return [...events].sort((a, b) => `${a.date}T${a.startUtc}`.localeCompare(`${b.date}T${b.startUtc}`));
}

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

export async function getEvents(): Promise<VirtualEvent[]> {
  try {
    const raw = await readFile(eventsFile, "utf8");
    const parsed = JSON.parse(raw) as VirtualEvent[];
    if (!Array.isArray(parsed)) return sortEvents(virtualEvents);
    return sortEvents(parsed);
  } catch {
    return sortEvents(virtualEvents);
  }
}

export async function saveEvents(events: VirtualEvent[]) {
  await ensureDataDir();
  const tmp = `${eventsFile}.tmp`;
  const body = `${JSON.stringify(sortEvents(events), null, 2)}\n`;
  await writeFile(tmp, body, "utf8");
  await rename(tmp, eventsFile);
}

export async function createEvent(event: VirtualEvent) {
  const events = await getEvents();
  if (events.some((item) => item.id === event.id)) {
    throw new Error("An event with this id already exists.");
  }
  events.push(event);
  await saveEvents(events);
  return event;
}

export async function updateEvent(id: string, event: VirtualEvent) {
  const events = await getEvents();
  const index = events.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("Event not found.");
  events[index] = { ...event, id };
  await saveEvents(events);
  return events[index];
}

export async function deleteEvent(id: string) {
  const events = await getEvents();
  const next = events.filter((item) => item.id !== id);
  if (next.length === events.length) throw new Error("Event not found.");
  await saveEvents(next);
}

export function slugifyEventTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
