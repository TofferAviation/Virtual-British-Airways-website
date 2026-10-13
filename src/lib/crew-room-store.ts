import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { VirtualEvent } from "@/data/events";
import { createCrewRoomEventChannel } from "@/lib/crew-room-chat-store";
import { getEvents } from "@/lib/event-store";

const SETTINGS_ID = "crew-lounge";
const CREW_ROOM_HERO_BUCKET = "crew-lounge-media";
const CREW_ROOM_HERO_MAX_BYTES = 5 * 1024 * 1024;

type CrewRoomSettingsRow = {
  id: string;
  featured_event_id: string | null;
  host_name: string;
  host_message: string;
  welcome_prompt: string;
  updated_at: string;
};

type CrewRoomEventMediaRow = {
  event_id: string;
  hero_object_key: string;
  hero_content_type: string;
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

export type CrewRoomEventHero = {
  eventId: string;
  updatedAt: string;
};

type CrewRoomEventHeroRecord = CrewRoomEventHero & {
  objectKey: string;
  contentType: "image/jpeg" | "image/png";
};

export type CrewRoomEventHeroBinary = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png";
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

function isPng(bytes: Uint8Array) {
  return bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function validateCrewRoomEventHeroUpload(contentTypeValue: string, bytes: Uint8Array) {
  const contentType = contentTypeValue.trim().toLowerCase();
  if (!bytes.byteLength) throw new CrewRoomExperienceError("Choose a JPG or PNG image for the Ember event hero.", 400);
  if (bytes.byteLength > CREW_ROOM_HERO_MAX_BYTES) {
    throw new CrewRoomExperienceError("Ember event heroes must be 5 MB or smaller.", 400);
  }
  if (contentType === "image/jpeg" && isJpeg(bytes)) return { contentType: "image/jpeg" as const, extension: ".jpg" };
  if (contentType === "image/png" && isPng(bytes)) return { contentType: "image/png" as const, extension: ".png" };
  throw new CrewRoomExperienceError("Use a valid JPG or PNG image for the Ember event hero.", 400);
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

function toCrewRoomEventHero(row: CrewRoomEventMediaRow): CrewRoomEventHeroRecord {
  const contentType = row.hero_content_type === "image/png" ? "image/png" : "image/jpeg";
  return {
    eventId: row.event_id,
    objectKey: row.hero_object_key,
    contentType,
    updatedAt: row.updated_at,
  };
}

function publicCrewRoomEventHero(record: CrewRoomEventHeroRecord): CrewRoomEventHero {
  return { eventId: record.eventId, updatedAt: record.updatedAt };
}

function isMissingCrewRoomEventHeroSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const details = error as { code?: unknown; message?: unknown };
  const code = typeof details.code === "string" ? details.code : "";
  const message = typeof details.message === "string" ? details.message : "";
  return code === "42P01" || code === "PGRST205" || message.includes("crew_room_event_media");
}

async function getCrewRoomEventHeroRecord(eventId: string) {
  const db = client();
  const { data, error } = await db
    .from("crew_room_event_media")
    .select("event_id, hero_object_key, hero_content_type, updated_at")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data ? toCrewRoomEventHero(data as CrewRoomEventMediaRow) : null;
}

export async function getCrewRoomEventHero(eventId: string) {
  try {
    const record = await getCrewRoomEventHeroRecord(eventId);
    return record ? publicCrewRoomEventHero(record) : null;
  } catch (error) {
    // The Crew Lounge remains usable if a deployment reaches the website just
    // before its companion migration has been applied.
    if (isMissingCrewRoomEventHeroSchema(error)) return null;
    throw error;
  }
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

async function downloadCrewRoomEventHero(record: CrewRoomEventHeroRecord): Promise<CrewRoomEventHeroBinary> {
  const db = client();
  const { data, error } = await db.storage.from(CREW_ROOM_HERO_BUCKET).download(record.objectKey);
  if (error) throw error;
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > CREW_ROOM_HERO_MAX_BYTES) {
    throw new CrewRoomExperienceError("The stored Ember event hero is unavailable.", 503);
  }
  return { bytes, contentType: record.contentType };
}

export async function uploadCrewRoomEventHero(input: {
  eventId: unknown;
  contentType: string;
  bytes: Uint8Array;
}) {
  const eventId = cleanText(input.eventId, "Featured event", 100);
  if (!eventId) throw new CrewRoomExperienceError("Choose a published BAV event before uploading an Ember hero.", 400);
  const event = await eventForCrewTable(eventId);
  const media = validateCrewRoomEventHeroUpload(input.contentType, input.bytes);
  const previous = await getCrewRoomEventHeroRecord(event.id);
  const objectKey = "event-heroes/" + randomUUID() + media.extension;
  const db = client();
  const { error: uploadError } = await db.storage.from(CREW_ROOM_HERO_BUCKET).upload(objectKey, Buffer.from(input.bytes), {
    contentType: media.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("crew_room_event_media")
    .upsert({
      event_id: event.id,
      hero_object_key: objectKey,
      hero_content_type: media.contentType,
      updated_at: now,
    }, { onConflict: "event_id" })
    .select("event_id, hero_object_key, hero_content_type, updated_at")
    .single();

  if (error) {
    await db.storage.from(CREW_ROOM_HERO_BUCKET).remove([objectKey]);
    throw error;
  }

  if (previous && previous.objectKey !== objectKey) {
    await db.storage.from(CREW_ROOM_HERO_BUCKET).remove([previous.objectKey]);
  }

  return publicCrewRoomEventHero(toCrewRoomEventHero(data as CrewRoomEventMediaRow));
}

export async function deleteCrewRoomEventHero(eventIdValue: unknown) {
  const eventId = cleanText(eventIdValue, "Featured event", 100);
  if (!eventId) throw new CrewRoomExperienceError("Choose a published BAV event before changing its Ember hero.", 400);
  const event = await eventForCrewTable(eventId);
  const previous = await getCrewRoomEventHeroRecord(event.id);
  if (!previous) return null;

  const db = client();
  const { error } = await db.from("crew_room_event_media").delete().eq("event_id", event.id);
  if (error) throw error;
  await db.storage.from(CREW_ROOM_HERO_BUCKET).remove([previous.objectKey]);
  return publicCrewRoomEventHero(previous);
}

export async function readCrewRoomEventHero(eventIdValue: unknown): Promise<CrewRoomEventHeroBinary | null> {
  const eventId = cleanText(eventIdValue, "Featured event", 100);
  if (!eventId) throw new CrewRoomExperienceError("Choose a published BAV event to view its Ember hero.", 400);
  const event = await eventForCrewTable(eventId);
  const record = await getCrewRoomEventHeroRecord(event.id);
  return record ? downloadCrewRoomEventHero(record) : null;
}

export async function readFeaturedCrewRoomEventHero(): Promise<CrewRoomEventHeroBinary | null> {
  const [settings, rawEvents] = await Promise.all([getCrewRoomSettings(), getEvents()]);
  if (!settings.featuredEventId) return null;
  const featuredEvent = publishedEvents(rawEvents).find((event) => event.id === settings.featuredEventId);
  if (!featuredEvent) return null;
  const record = await getCrewRoomEventHeroRecord(featuredEvent.id);
  return record ? downloadCrewRoomEventHero(record) : null;
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
  const featuredHero = featuredEvent ? await getCrewRoomEventHero(featuredEvent.id) : null;
  return { settings, featuredEvent, featuredHero, events: events.slice(0, 12) };
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
