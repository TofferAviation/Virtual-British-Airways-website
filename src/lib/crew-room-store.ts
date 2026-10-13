import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VirtualEvent } from "@/data/events";
import { createCrewRoomEventChannel } from "@/lib/crew-room-chat-store";
import { getEvents } from "@/lib/event-store";

const SETTINGS_ID = "crew-lounge";

type CrewRoomSettingsRow = {
  id: string;
  featured_event_id: string | null;
  host_name: string;
  host_message: string;
  welcome_prompt: string;
  updated_at: string;
};

type CrewRoomIntentRow = {
  id: string;
  event_id: string;
  pilot_id: string;
  pilot_number: string;
  pilot_name: string;
  pilot_rank: string;
  flight_number: string | null;
  route: string | null;
  aircraft: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export type CrewRoomSettings = {
  featuredEventId: string | null;
  hostName: string;
  hostMessage: string;
  welcomePrompt: string;
  updatedAt: string | null;
};

export type CrewRoomEvent = {
  id: string;
  title: string;
  typeLabel: string;
  date: string;
  startUtc: string;
  endUtc: string;
  route: VirtualEvent["route"];
  summary: string;
  aircraftNote: string;
  rewards: VirtualEvent["rewards"];
  tableChannel: string;
};

export type CrewRoomIntent = {
  id: string;
  eventId: string;
  pilotId: string;
  pilotNumber: string;
  pilotName: string;
  rank: string;
  flightNumber: string | null;
  route: string | null;
  aircraft: string | null;
  updatedAt: string;
};

export class CrewRoomExperienceError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Crew Lounge requires the configured BAV operational data service.");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function defaultSettings(): CrewRoomSettings {
  return {
    featuredEventId: null,
    hostName: "BAV Community",
    hostMessage: "The Crew Lounge is open. Pull up a chair, share a route idea, and make another pilot feel welcome.",
    welcomePrompt: "What are you planning to fly next?",
    updatedAt: null,
  };
}

function toSettings(row: CrewRoomSettingsRow | null): CrewRoomSettings {
  if (!row) return defaultSettings();
  return {
    featuredEventId: row.featured_event_id || null,
    hostName: row.host_name || "BAV Community",
    hostMessage: row.host_message || defaultSettings().hostMessage,
    welcomePrompt: row.welcome_prompt || defaultSettings().welcomePrompt,
    updatedAt: row.updated_at || null,
  };
}

function toCrewRoomEvent(event: VirtualEvent): CrewRoomEvent {
  return {
    id: event.id,
    title: event.title,
    typeLabel: event.typeLabel,
    date: event.date,
    startUtc: event.startUtc,
    endUtc: event.endUtc,
    route: event.route,
    summary: event.summary,
    aircraftNote: event.aircraftNote,
    rewards: event.rewards,
    tableChannel: createCrewRoomEventChannel(event.id),
  };
}

function toIntent(row: CrewRoomIntentRow): CrewRoomIntent {
  return {
    id: row.id,
    eventId: row.event_id,
    pilotId: row.pilot_id,
    pilotNumber: row.pilot_number,
    pilotName: row.pilot_name,
    rank: row.pilot_rank || "BAV pilot",
    flightNumber: row.flight_number || null,
    route: row.route || null,
    aircraft: row.aircraft || null,
    updatedAt: row.updated_at,
  };
}

function cleanText(value: unknown, label: string, maxLength: number, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new CrewRoomExperienceError(`${label} must be text.`, 400);
  const clean = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (clean.length > maxLength) throw new CrewRoomExperienceError(`${label} is too long.`, 400);
  return clean || fallback;
}

function cleanOptionalText(value: unknown, label: string, maxLength: number) {
  return cleanText(value, label, maxLength) || null;
}

function publishedEvents(events: VirtualEvent[]) {
  const today = new Date().toISOString().slice(0, 10);
  return events
    .filter((event) => event.published && event.date >= today)
    .sort((left, right) => `${left.date}T${left.startUtc}`.localeCompare(`${right.date}T${right.startUtc}`));
}

async function eventForCrewTable(eventId: string) {
  const events = publishedEvents(await getEvents());
  const event = events.find((candidate) => candidate.id === eventId);
  if (!event) throw new CrewRoomExperienceError("That community event is not available for the Crew Table.", 404);
  return event;
}

function eventExpiry(event: VirtualEvent) {
  const time = /^\d{2}:\d{2}$/.test(event.endUtc) ? event.endUtc : "23:59";
  const end = new Date(`${event.date}T${time}:00Z`);
  if (Number.isNaN(end.getTime()) || end.getTime() < Date.now()) {
    throw new CrewRoomExperienceError("That Crew Table has closed. Choose an upcoming BAV event instead.", 409);
  }
  return new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export async function getCrewRoomSettings() {
  const db = client();
  const { data, error } = await db
    .from("crew_room_settings")
    .select("id, featured_event_id, host_name, host_message, welcome_prompt, updated_at")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  if (error) throw error;
  return toSettings(data as CrewRoomSettingsRow | null);
}

export async function getCrewRoomExperience() {
  const [settings, rawEvents] = await Promise.all([getCrewRoomSettings(), getEvents()]);
  const events = publishedEvents(rawEvents).map(toCrewRoomEvent);
  const featuredEvent = settings.featuredEventId
    ? events.find((event) => event.id === settings.featuredEventId) ?? null
    : null;
  return { settings, featuredEvent, events: events.slice(0, 12) };
}

export async function saveCrewRoomSettings(input: {
  featuredEventId: unknown;
  hostName: unknown;
  hostMessage: unknown;
  welcomePrompt: unknown;
}) {
  const featuredEventId = cleanOptionalText(input.featuredEventId, "Featured event", 100);
  if (featuredEventId) await eventForCrewTable(featuredEventId);
  const hostName = cleanText(input.hostName, "Host name", 80, "BAV Community");
  const hostMessage = cleanText(input.hostMessage, "Host message", 360, defaultSettings().hostMessage);
  const welcomePrompt = cleanText(input.welcomePrompt, "Welcome prompt", 160, defaultSettings().welcomePrompt);
  const now = new Date().toISOString();
  const db = client();
  const { data, error } = await db
    .from("crew_room_settings")
    .upsert({
      id: SETTINGS_ID,
      featured_event_id: featuredEventId,
      host_name: hostName,
      host_message: hostMessage,
      welcome_prompt: welcomePrompt,
      updated_at: now,
    }, { onConflict: "id" })
    .select("id, featured_event_id, host_name, host_message, welcome_prompt, updated_at")
    .single();
  if (error) throw error;
  return toSettings(data as CrewRoomSettingsRow);
}

export async function listCrewRoomIntents(eventId: string) {
  await eventForCrewTable(eventId);
  const db = client();
  const { data, error } = await db
    .from("crew_room_intentions")
    .select("id, event_id, pilot_id, pilot_number, pilot_name, pilot_rank, flight_number, route, aircraft, created_at, updated_at, expires_at")
    .eq("event_id", eventId)
    .gt("expires_at", new Date().toISOString())
    .order("updated_at", { ascending: false })
    .limit(48);
  if (error) throw error;
  return ((data ?? []) as CrewRoomIntentRow[]).map(toIntent);
}

export async function upsertCrewRoomIntent(input: {
  eventId: unknown;
  pilotId: string;
  pilotNumber: string;
  pilotName: string;
  pilotRank: string | null | undefined;
  flightNumber: unknown;
  route: unknown;
  aircraft: unknown;
}) {
  const eventId = cleanText(input.eventId, "Event", 100);
  if (!eventId) throw new CrewRoomExperienceError("Choose a BAV event before joining its planning board.", 400);
  const event = await eventForCrewTable(eventId);
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    event_id: event.id,
    pilot_id: input.pilotId,
    pilot_number: input.pilotNumber,
    pilot_name: input.pilotName,
    pilot_rank: input.pilotRank?.trim() || "BAV pilot",
    flight_number: cleanOptionalText(input.flightNumber, "Flight number", 40),
    route: cleanOptionalText(input.route, "Route", 120),
    aircraft: cleanOptionalText(input.aircraft, "Aircraft", 120),
    created_at: now,
    updated_at: now,
    expires_at: eventExpiry(event),
  };
  const db = client();
  const { data, error } = await db
    .from("crew_room_intentions")
    .upsert(row, { onConflict: "event_id,pilot_id" })
    .select("id, event_id, pilot_id, pilot_number, pilot_name, pilot_rank, flight_number, route, aircraft, created_at, updated_at, expires_at")
    .single();
  if (error) throw error;
  return toIntent(data as CrewRoomIntentRow);
}

export async function removeCrewRoomIntent(eventIdValue: unknown, pilotId: string) {
  const eventId = cleanText(eventIdValue, "Event", 100);
  if (!eventId) throw new CrewRoomExperienceError("Choose a BAV event before updating the planning board.", 400);
  const db = client();
  const { error } = await db.from("crew_room_intentions").delete().eq("event_id", eventId).eq("pilot_id", pilotId);
  if (error) throw error;
}
