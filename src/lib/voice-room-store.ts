import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CREW_ROOM_BANNER_ID, isCrewRoomBannerId } from "@/lib/crew-room-banner-library";
import { getEvents } from "@/lib/event-store";
import { getActivePilotBooking, getPilotBooking, getPilotFlightPlan, type PilotBooking, type PilotFlightPlan } from "@/lib/pilot-operations-store";
import { getPilotById } from "@/lib/pilot-store";

export const VOICE_ROOM_CHANNEL_PREFIX = "voice:";
export type VoiceRoomStatus = "scheduled" | "open" | "closed";
const CREW_ROOM_REQUEST_BUCKET = "crew-room-request-media";

type VoiceRoomRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  event_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: VoiceRoomStatus;
  max_participants?: number;
  banner_id?: string | null;
  banner_object_key?: string | null;
  banner_content_type?: string | null;
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
  maxParticipants: number;
  bannerId: string;
  hasCustomBanner: boolean;
  createdAt: string;
  updatedAt: string;
};

type VoiceRoomBriefingRow = { room_id: string; pic_pilot_id: string; booking_id: string | null; updated_at: string };

export type VoiceRoomBriefing = {
  picPilotId: string;
  bookingId: string | null;
  updatedAt: string;
  plan: null | {
    flightNumber: string; from: string; to: string; aircraft: string; date: string;
    departure: string; arrival: string; duration: string; registration: string | null;
    route: string | null; cruiseAltitude: string | null; alternate: string | null;
    simbrief: Pick<NonNullable<PilotFlightPlan["simbriefBriefing"]>, "originMetar" | "destinationMetar" | "originRunway" | "destinationRunway" | "distanceNm" | "passengerCount" | "blockFuel" | "tripFuel" | "scheduledOut" | "scheduledIn" | "blockTime" | "aircraftIcao"> | null;
  };
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
    maxParticipants: typeof row.max_participants === "number" ? row.max_participants : 8,
    bannerId: isCrewRoomBannerId(row.banner_id) ? row.banner_id : DEFAULT_CREW_ROOM_BANNER_ID,
    hasCustomBanner: Boolean(row.banner_object_key),
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

function cleanCapacity(value: unknown) {
  const capacity = value === undefined || value === null || value === "" ? 8 : Number(value);
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 8) {
    throw new VoiceRoomError("Choose a room size between 2 and 8 pilots.", 400);
  }
  return capacity;
}

function cleanBanner(value: unknown) {
  if (value === undefined || value === null || value === "") return DEFAULT_CREW_ROOM_BANNER_ID;
  if (isCrewRoomBannerId(value)) return value;
  throw new VoiceRoomError("Choose a valid Crew Lounge banner.", 400);
}

function cleanBannerObjectKey(value: unknown) {
  return cleanOptionalText(value, "Custom banner", 255);
}

function cleanBannerContentType(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (value === "image/jpeg" || value === "image/png") return value;
  throw new VoiceRoomError("Custom banners must be JPG or PNG images.", 400);
}

function voiceRoomColumns() {
  return "id, slug, name, description, event_id, starts_at, ends_at, status, max_participants, banner_id, banner_object_key, banner_content_type, created_at, updated_at";
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

function isMissingBriefingSchema(error: unknown) {
  const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
  return message.includes("crew_voice_room_briefings") || (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01");
}

function briefingPlan(booking: PilotBooking, flightPlan: PilotFlightPlan | null): VoiceRoomBriefing["plan"] {
  const source = flightPlan?.simbriefBriefing;
  return {
    flightNumber: booking.flightNumber, from: booking.from, to: booking.to, aircraft: booking.aircraft, date: booking.date,
    departure: booking.departure, arrival: booking.arrival, duration: booking.duration, registration: booking.registration,
    route: flightPlan?.route ?? null, cruiseAltitude: flightPlan?.cruiseAltitude ?? null, alternate: flightPlan?.alternate ?? null,
    simbrief: source ? {
      originMetar: source.originMetar, destinationMetar: source.destinationMetar, originRunway: source.originRunway,
      destinationRunway: source.destinationRunway, distanceNm: source.distanceNm, passengerCount: source.passengerCount,
      blockFuel: source.blockFuel, tripFuel: source.tripFuel, scheduledOut: source.scheduledOut,
      scheduledIn: source.scheduledIn, blockTime: source.blockTime, aircraftIcao: source.aircraftIcao,
    } : null,
  };
}

async function readRoomBriefing(roomId: string) {
  const { data, error } = await client().from("crew_voice_room_briefings")
    .select("room_id, pic_pilot_id, booking_id, updated_at").eq("room_id", roomId).maybeSingle();
  if (error) {
    if (isMissingBriefingSchema(error)) throw new VoiceRoomError("Apply the Crew Lounge briefing-plan migration before configuring the PIC.", 503);
    throw error;
  }
  return data as VoiceRoomBriefingRow | null;
}

export async function getVoiceRoomBriefing(roomIdValue: unknown): Promise<VoiceRoomBriefing | null> {
  const room = await getVoiceRoomById(roomIdValue);
  const briefing = await readRoomBriefing(room.id);
  if (!briefing) return null;
  const booking = briefing.booking_id ? await getPilotBooking(briefing.booking_id, briefing.pic_pilot_id) : null;
  const flightPlan = booking ? await getPilotFlightPlan(booking.id, booking.pilotId) : null;
  return { picPilotId: briefing.pic_pilot_id, bookingId: booking?.id ?? null, updatedAt: briefing.updated_at, plan: booking ? briefingPlan(booking, flightPlan) : null };
}

export async function configureVoiceRoomBriefingPic(input: { roomId: unknown; picPilotId: unknown }) {
  const room = await getVoiceRoomById(input.roomId, { includeClosed: true });
  const picPilotId = cleanText(input.picPilotId, "Pilot in command", 80);
  if (!picPilotId) throw new VoiceRoomError("Choose the pilot in command for this briefing room.", 400);
  const pilot = await getPilotById(picPilotId);
  if (!pilot || pilot.status !== "active") throw new VoiceRoomError("Choose an active BAV pilot as the pilot in command.", 404);
  const now = new Date().toISOString();
  const { error } = await client().from("crew_voice_room_briefings").upsert({ room_id: room.id, pic_pilot_id: picPilotId, booking_id: null, updated_at: now }, { onConflict: "room_id" });
  if (error) {
    if (isMissingBriefingSchema(error)) throw new VoiceRoomError("Apply the Crew Lounge briefing-plan migration before configuring the PIC.", 503);
    throw error;
  }
  return getVoiceRoomBriefing(room.id);
}

export async function publishPicActiveBooking(roomIdValue: unknown, pilotId: string) {
  const room = await getVoiceRoomById(roomIdValue);
  const briefing = await readRoomBriefing(room.id);
  if (!briefing || briefing.pic_pilot_id !== pilotId) throw new VoiceRoomError("Only this room’s assigned PIC can publish its briefing plan.", 403);
  const booking = await getActivePilotBooking(pilotId);
  if (!booking) throw new VoiceRoomError("Book or begin your BAV flight first, then publish it to the crew room.", 409);
  const { error } = await client().from("crew_voice_room_briefings")
    .update({ booking_id: booking.id, updated_at: new Date().toISOString() }).eq("room_id", room.id).eq("pic_pilot_id", pilotId);
  if (error) throw error;
  return getVoiceRoomBriefing(room.id);
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
      .select(voiceRoomColumns())
      .order("status", { ascending: true })
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (!options?.includeClosed) query = query.neq("status", "closed");
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as unknown as VoiceRoomRow[]).map(toVoiceRoom);
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
      .select(voiceRoomColumns())
      .eq("id", id);
    if (!options?.includeClosed) query = query.neq("status", "closed");
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) throw new VoiceRoomError("That voice room is not available.", 404);
    return toVoiceRoom(data as unknown as VoiceRoomRow);
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
  maxParticipants?: unknown;
  bannerId?: unknown;
  bannerObjectKey?: unknown;
  bannerContentType?: unknown;
  briefingPicPilotId?: unknown;
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
  const maxParticipants = cleanCapacity(input.maxParticipants);
  const bannerId = cleanBanner(input.bannerId);
  const bannerObjectKey = cleanBannerObjectKey(input.bannerObjectKey);
  const bannerContentType = cleanBannerContentType(input.bannerContentType);
  if (Boolean(bannerObjectKey) !== Boolean(bannerContentType)) {
    throw new VoiceRoomError("A custom banner needs both its image and image type.", 400);
  }
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
      max_participants: maxParticipants,
      banner_id: bannerId,
      banner_object_key: bannerObjectKey,
      banner_content_type: bannerContentType,
      // The opaque key avoids turning a staff-facing room label into a public meeting URL.
      meeting_key: `bav-${id.replaceAll("-", "")}`,
      created_at: now,
      updated_at: now,
    })
    .select(voiceRoomColumns())
    .single();
  if (error) {
    if (error.code === "23505") throw new VoiceRoomError("That room address is already in use.", 409);
    if (isMissingVoiceRoomSchema(error)) throw new VoiceRoomError("Apply the Crew Lounge voice-room migration before creating rooms.", 503);
    throw error;
  }
  const room = toVoiceRoom(data as unknown as VoiceRoomRow);
  const briefingPicPilotId = cleanOptionalText(input.briefingPicPilotId, "Pilot in command", 80);
  if (briefingPicPilotId) await configureVoiceRoomBriefingPic({ roomId: room.id, picPilotId: briefingPicPilotId });
  return room;
}

export async function updateVoiceRoomStatus(input: { id: unknown; status: unknown }) {
  const room = await getVoiceRoomById(input.id, { includeClosed: true });
  const status = cleanStatus(input.status);
  const { data, error } = await client()
    .from("crew_voice_rooms")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", room.id)
    .select(voiceRoomColumns())
    .single();
  if (error) throw error;
  return toVoiceRoom(data as unknown as VoiceRoomRow);
}

/** Custom room artwork is held in private Storage and only streamed through an authenticated website route. */
export async function readVoiceRoomCustomBanner(idValue: unknown) {
  const room = await getVoiceRoomById(idValue);
  if (!room.hasCustomBanner) return null;
  const { data, error } = await client()
    .from("crew_voice_rooms")
    .select("banner_object_key, banner_content_type")
    .eq("id", room.id)
    .maybeSingle();
  if (error) throw error;
  const record = data as { banner_object_key: string | null; banner_content_type: string | null } | null;
  if (!record?.banner_object_key || (record.banner_content_type !== "image/jpeg" && record.banner_content_type !== "image/png")) return null;
  const { data: file, error: fileError } = await client().storage.from(CREW_ROOM_REQUEST_BUCKET).download(record.banner_object_key);
  if (fileError) throw fileError;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) throw new VoiceRoomError("The custom room banner is unavailable.", 503);
  return { bytes, contentType: record.banner_content_type };
}
