import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEvents } from "@/lib/event-store";

export const VOICE_ROOM_CHANNEL_PREFIX = "voice:";
export type VoiceRoomStatus = "scheduled" | "open" | "closed";

type VoiceRoomRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  event_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: VoiceRoomStatus;
  created_at: string;
  updated_at: string;
};

export type VoiceRoom = {
  id: string;
  slug: string;
  name: string;
  description: string;
  eventId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: VoiceRoomStatus;
  createdAt: string;
  updatedAt: string;
};

export class VoiceRoomError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Voice rooms require the configured BAV operational data service.");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function isVoiceRoomStoreConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function toVoiceRoom(row: VoiceRoomRow): VoiceRoom {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    eventId: row.event_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function cleanText(value: unknown, label: string, maximum: number, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new VoiceRoomError(`${label} must be text.`, 400);
  const clean = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (clean.length > maximum) throw new VoiceRoomError(`${label} is too long.`, 400);
  return clean || fallback;
}

function cleanOptionalText(value: unknown, label: string, maximum: number) {
  return cleanText(value, label, maximum) || null;
}

function cleanSlug(value: unknown) {
  const source = cleanText(value, "Room address", 80).toLowerCase();
  const slug = source
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) {
    throw new VoiceRoomError("Use a room address with 3–64 letters, numbers or hyphens.", 400);
  }
  return slug;
}

function cleanStatus(value: unknown): VoiceRoomStatus {
  if (value === "scheduled" || value === "open" || value === "closed") return value;
  throw new VoiceRoomError("Choose whether this room is scheduled, open or closed.", 400);
}

function cleanDate(value: unknown, label: string) {
  const date = cleanOptionalText(value, label, 64);
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) throw new VoiceRoomError(`${label} is not a valid date and time.`, 400);
  return parsed.toISOString();
}

function isMissingVoiceRoomSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const details = error as { code?: unknown; message?: unknown };
  const code = typeof details.code === "string" ? details.code : "";
  const message = typeof details.message === "string" ? details.message : "";
  return code === "42P01" || code === "PGRST205" || message.includes("crew_voice_rooms");
}

async function assertEventAvailable(eventId: string | null) {
  if (!eventId) return null;
  const events = await getEvents();
  const event = events.find((candidate) => candidate.id === eventId && candidate.published);
  if (!event) throw new VoiceRoomError("Choose a published BAV calendar event, or leave the room independent.", 404);
  return event;
}

export function voiceRoomChannel(roomId: string) {
  return `${VOICE_ROOM_CHANNEL_PREFIX}${roomId}`;
}

export async function listVoiceRooms(options?: { includeClosed?: boolean }) {
  // A missing companion schema or data-service setting should leave pilots with
  // an empty room board, never a failed Community page.
  if (!isVoiceRoomStoreConfigured()) return [];
  try {
    let query = client()
      .from("crew_voice_rooms")
      .select("id, slug, name, description, event_id, starts_at, ends_at, status, created_at, updated_at")
      .order("status", { ascending: true })
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (!options?.includeClosed) query = query.neq("status", "closed");
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as VoiceRoomRow[]).map(toVoiceRoom);
  } catch (error) {
    // Deploys remain safe while the companion migration is being applied.
    if (isMissingVoiceRoomSchema(error)) return [];
    // The lounge is an optional community surface. A temporary data-service
    // problem must not turn a pilot's normal navigation into a 500 page.
    console.error("[voice-rooms] Could not load the room board.", error);
    return [];
  }
}

export async function getVoiceRoomById(idValue: unknown, options?: { includeClosed?: boolean }) {
  const id = cleanText(idValue, "Voice room", 64);
  if (!id) throw new VoiceRoomError("Choose a voice room.", 400);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new VoiceRoomError("That voice room is not available.", 404);
  }
  try {
    let query = client()
      .from("crew_voice_rooms")
      .select("id, slug, name, description, event_id, starts_at, ends_at, status, created_at, updated_at")
      .eq("id", id);
    if (!options?.includeClosed) query = query.neq("status", "closed");
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) throw new VoiceRoomError("That voice room is not available.", 404);
    return toVoiceRoom(data as VoiceRoomRow);
  } catch (error) {
    if (isMissingVoiceRoomSchema(error)) {
      throw new VoiceRoomError("Voice rooms are waiting for their database setup. Apply the Crew Lounge voice-room migration, then try again.", 503);
    }
    throw error;
  }
}

export async function createVoiceRoom(input: {
  name: unknown;
  slug: unknown;
  description: unknown;
  eventId: unknown;
  startsAt: unknown;
  endsAt: unknown;
  status: unknown;
}) {
  const name = cleanText(input.name, "Room name", 80);
  if (!name) throw new VoiceRoomError("Give the room a name.", 400);
  const slug = cleanSlug(input.slug);
  const description = cleanText(input.description, "Room description", 240, "A BAV Crew Lounge voice room.");
  const eventId = cleanOptionalText(input.eventId, "Linked event", 100);
  await assertEventAvailable(eventId);
  const startsAt = cleanDate(input.startsAt, "Start time");
  const endsAt = cleanDate(input.endsAt, "End time");
  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new VoiceRoomError("The room end time must be after its start time.", 400);
  }
  const status = cleanStatus(input.status);
  const id = randomUUID();
  const now = new Date().toISOString();
  const { data, error } = await client()
    .from("crew_voice_rooms")
    .insert({
      id,
      slug,
      name,
      description,
      event_id: eventId,
      starts_at: startsAt,
      ends_at: endsAt,
      status,
      // The opaque key avoids turning a staff-facing room label into a public meeting URL.
      meeting_key: `bav-${id.replaceAll("-", "")}`,
      created_at: now,
      updated_at: now,
    })
    .select("id, slug, name, description, event_id, starts_at, ends_at, status, created_at, updated_at")
    .single();
  if (error) {
    if (error.code === "23505") throw new VoiceRoomError("That room address is already in use.", 409);
    if (isMissingVoiceRoomSchema(error)) throw new VoiceRoomError("Apply the Crew Lounge voice-room migration before creating rooms.", 503);
    throw error;
  }
  return toVoiceRoom(data as VoiceRoomRow);
}

export async function updateVoiceRoomStatus(input: { id: unknown; status: unknown }) {
  const room = await getVoiceRoomById(input.id, { includeClosed: true });
  const status = cleanStatus(input.status);
  const { data, error } = await client()
    .from("crew_voice_rooms")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", room.id)
    .select("id, slug, name, description, event_id, starts_at, ends_at, status, created_at, updated_at")
    .single();
  if (error) throw error;
  return toVoiceRoom(data as VoiceRoomRow);
}
