import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { crewRoomBannerById, DEFAULT_CREW_ROOM_BANNER_ID, isCrewRoomBannerId } from "@/lib/crew-room-banner-library";
import { createPilotNotification } from "@/lib/pilot-store";
import { createVoiceRoom, type VoiceRoom } from "@/lib/voice-room-store";

const CREW_ROOM_REQUEST_BUCKET = "crew-room-request-media";
const MAX_BANNER_BYTES = 5 * 1024 * 1024;
const MIN_CAPACITY = 2;
const MAX_CAPACITY = 8;

export type CrewRoomRequestStatus = "pending" | "approved" | "declined" | "cancelled";
export type CrewRoomMediaPreference = "voice" | "camera" | "screen";

type CrewRoomRequestRow = {
  id: string;
  pilot_id: string;
  pilot_number: string;
  pilot_name: string;
  pilot_rank: string;
  booking_id: string;
  flight_number: string;
  route_from: string;
  route_to: string;
  aircraft: string;
  flight_date: string;
  departure_time: string;
  arrival_time: string;
  duration: string;
  room_name: string;
  welcome_note: string;
  requested_capacity: number;
  media_preferences: CrewRoomMediaPreference[];
  banner_id: string;
  banner_object_key: string | null;
  banner_content_type: string | null;
  status: CrewRoomRequestStatus;
  staff_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  voice_room_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CrewRoomRequest = {
  id: string;
  pilotId: string;
  pilotNumber: string;
  pilotName: string;
  pilotRank: string;
  bookingId: string;
  flightNumber: string;
  routeFrom: string;
  routeTo: string;
  aircraft: string;
  flightDate: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  roomName: string;
  welcomeNote: string;
  requestedCapacity: number;
  mediaPreferences: CrewRoomMediaPreference[];
  bannerId: string;
  hasCustomBanner: boolean;
  status: CrewRoomRequestStatus;
  staffNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  voiceRoomId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrewRoomBannerUpload = {
  contentType: string;
  bytes: Uint8Array;
};

export class CrewRoomRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("Crew-room requests need the configured BAV community data service.");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function cleanText(value: unknown, label: string, maximum: number, fallback = "") {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new CrewRoomRequestError(`${label} must be text.`, 400);
  const clean = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (clean.length > maximum) throw new CrewRoomRequestError(`${label} is too long.`, 400);
  return clean || fallback;
}

function cleanCapacity(value: unknown) {
  const capacity = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(capacity) || capacity < MIN_CAPACITY || capacity > MAX_CAPACITY) {
    throw new CrewRoomRequestError(`Choose a room size between ${MIN_CAPACITY} and ${MAX_CAPACITY} pilots.`, 400);
  }
  return capacity;
}

function cleanMediaPreferences(value: unknown): CrewRoomMediaPreference[] {
  if (!Array.isArray(value)) return ["voice"];
  const preferences = [...new Set(value.filter((item): item is CrewRoomMediaPreference => item === "voice" || item === "camera" || item === "screen"))];
  return preferences.length ? preferences : ["voice"];
}

function cleanBannerId(value: unknown) {
  if (value === "custom") return "custom";
  if (isCrewRoomBannerId(value)) return value;
  if (value === undefined || value === null || value === "") return DEFAULT_CREW_ROOM_BANNER_ID;
  throw new CrewRoomRequestError("Choose one of the BAV Lounge banners, or upload your own JPG or PNG.", 400);
}

function isPng(bytes: Uint8Array) {
  return bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function validateCrewRoomBannerUpload(contentTypeValue: string, bytes: Uint8Array) {
  const contentType = contentTypeValue.trim().toLowerCase();
  if (!bytes.byteLength) throw new CrewRoomRequestError("Choose a JPG or PNG banner image.", 400);
  if (bytes.byteLength > MAX_BANNER_BYTES) throw new CrewRoomRequestError("Custom room banners must be 5 MB or smaller.", 400);
  if (contentType === "image/jpeg" && isJpeg(bytes)) return { contentType: "image/jpeg" as const, extension: ".jpg" };
  if (contentType === "image/png" && isPng(bytes)) return { contentType: "image/png" as const, extension: ".png" };
  throw new CrewRoomRequestError("Use a valid JPG or PNG banner image.", 400);
}

function toRequest(row: CrewRoomRequestRow): CrewRoomRequest {
  return {
    id: row.id,
    pilotId: row.pilot_id,
    pilotNumber: row.pilot_number,
    pilotName: row.pilot_name,
    pilotRank: row.pilot_rank || "BAV pilot",
    bookingId: row.booking_id,
    flightNumber: row.flight_number,
    routeFrom: row.route_from,
    routeTo: row.route_to,
    aircraft: row.aircraft,
    flightDate: row.flight_date,
    departureTime: row.departure_time,
    arrivalTime: row.arrival_time,
    duration: row.duration,
    roomName: row.room_name,
    welcomeNote: row.welcome_note,
    requestedCapacity: row.requested_capacity,
    mediaPreferences: cleanMediaPreferences(row.media_preferences),
    bannerId: row.banner_id || DEFAULT_CREW_ROOM_BANNER_ID,
    hasCustomBanner: Boolean(row.banner_object_key),
    status: row.status,
    staffNote: row.staff_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    voiceRoomId: row.voice_room_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingRequestSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const detail = error as { code?: unknown; message?: unknown };
  const code = typeof detail.code === "string" ? detail.code : "";
  const message = typeof detail.message === "string" ? detail.message : "";
  return code === "42P01" || code === "PGRST205" || message.includes("crew_room_requests");
}

function requestColumns() {
  return "id, pilot_id, pilot_number, pilot_name, pilot_rank, booking_id, flight_number, route_from, route_to, aircraft, flight_date, departure_time, arrival_time, duration, room_name, welcome_note, requested_capacity, media_preferences, banner_id, banner_object_key, banner_content_type, status, staff_note, reviewed_by, reviewed_at, voice_room_id, created_at, updated_at";
}

async function uploadBanner(upload: CrewRoomBannerUpload) {
  const media = validateCrewRoomBannerUpload(upload.contentType, upload.bytes);
  const objectKey = `request-banners/${randomUUID()}${media.extension}`;
  const { error } = await client().storage.from(CREW_ROOM_REQUEST_BUCKET).upload(objectKey, Buffer.from(upload.bytes), {
    contentType: media.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new CrewRoomRequestError("Your banner could not be uploaded. Please try again.", 503);
  return { objectKey, contentType: media.contentType };
}

async function removeBanner(objectKey: string | null) {
  if (!objectKey) return;
  await client().storage.from(CREW_ROOM_REQUEST_BUCKET).remove([objectKey]);
}

export async function listPilotCrewRoomRequests(pilotId: string) {
  if (!configured()) return [];
  try {
    const { data, error } = await client()
      .from("crew_room_requests")
      .select(requestColumns())
      .eq("pilot_id", pilotId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw error;
    return ((data ?? []) as unknown as CrewRoomRequestRow[]).map(toRequest);
  } catch (error) {
    if (isMissingRequestSchema(error)) return [];
    console.error("[crew-room-requests] Could not load the pilot request list.", error);
    return [];
  }
}

export async function listCrewRoomRequestsForStaff() {
  if (!configured()) return [];
  try {
    const { data, error } = await client()
      .from("crew_room_requests")
      .select(requestColumns())
      .order("status", { ascending: true })
      .order("flight_date", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(120);
    if (error) throw error;
    return ((data ?? []) as unknown as CrewRoomRequestRow[]).map(toRequest);
  } catch (error) {
    if (isMissingRequestSchema(error)) return [];
    console.error("[crew-room-requests] Could not load the staff request queue.", error);
    return [];
  }
}

export async function pendingCrewRoomRequestCount() {
  if (!configured()) return 0;
  try {
    const { count, error } = await client().from("crew_room_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
    if (error) throw error;
    return count ?? 0;
  } catch (error) {
    if (isMissingRequestSchema(error)) return 0;
    console.error("[crew-room-requests] Could not count the staff queue.", error);
    return 0;
  }
}

export async function createCrewRoomRequest(input: {
  pilotId: string;
  pilotNumber: string;
  pilotName: string;
  pilotRank: string | null | undefined;
  booking: { id: string; flightNumber: string; from: string; to: string; aircraft: string; date: string; departure: string; arrival: string; duration: string };
  roomName: unknown;
  welcomeNote: unknown;
  requestedCapacity: unknown;
  mediaPreferences: unknown;
  bannerId: unknown;
  bannerUpload?: CrewRoomBannerUpload | null;
}) {
  const roomName = cleanText(input.roomName, "Room name", 80);
  if (!roomName) throw new CrewRoomRequestError("Give your crew room a welcoming name.", 400);
  const welcomeNote = cleanText(input.welcomeNote, "Welcome note", 240, "A pilot-hosted BAV Crew Lounge room.");
  const requestedCapacity = cleanCapacity(input.requestedCapacity);
  const mediaPreferences = cleanMediaPreferences(input.mediaPreferences);
  const requestedBannerId = cleanBannerId(input.bannerId);
  if (requestedBannerId === "custom" && !input.bannerUpload) {
    throw new CrewRoomRequestError("Choose the JPG or PNG banner you would like staff to review.", 400);
  }
  if (requestedBannerId !== "custom" && input.bannerUpload) {
    throw new CrewRoomRequestError("Choose “Upload my own” before attaching a custom banner.", 400);
  }

  const db = client();
  const { data: duplicate, error: duplicateError } = await db
    .from("crew_room_requests")
    .select("id")
    .eq("pilot_id", input.pilotId)
    .eq("booking_id", input.booking.id)
    .eq("status", "pending")
    .maybeSingle();
  if (duplicateError && !isMissingRequestSchema(duplicateError)) throw duplicateError;
  if (duplicate) throw new CrewRoomRequestError("You already have a crew-room request waiting for this flight. Staff will review it shortly.", 409);

  let banner: { objectKey: string; contentType: string } | null = null;
  if (input.bannerUpload) banner = await uploadBanner(input.bannerUpload);
  const now = new Date().toISOString();
  const record = {
    id: randomUUID(),
    pilot_id: input.pilotId,
    pilot_number: cleanText(input.pilotNumber, "Pilot number", 64, "BAV pilot"),
    pilot_name: cleanText(input.pilotName, "Pilot name", 160, "BAV pilot"),
    pilot_rank: cleanText(input.pilotRank, "Pilot rank", 100, "BAV pilot"),
    booking_id: input.booking.id,
    flight_number: input.booking.flightNumber,
    route_from: input.booking.from,
    route_to: input.booking.to,
    aircraft: input.booking.aircraft,
    flight_date: input.booking.date,
    departure_time: input.booking.departure,
    arrival_time: input.booking.arrival,
    duration: input.booking.duration,
    room_name: roomName,
    welcome_note: welcomeNote,
    requested_capacity: requestedCapacity,
    media_preferences: mediaPreferences,
    banner_id: requestedBannerId === "custom" ? DEFAULT_CREW_ROOM_BANNER_ID : requestedBannerId,
    banner_object_key: banner?.objectKey ?? null,
    banner_content_type: banner?.contentType ?? null,
    status: "pending" as const,
    staff_note: null,
    reviewed_by: null,
    reviewed_at: null,
    voice_room_id: null,
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await db.from("crew_room_requests").insert(record).select(requestColumns()).single();
  if (error) {
    await removeBanner(banner?.objectKey ?? null);
    if (isMissingRequestSchema(error)) throw new CrewRoomRequestError("Crew-room requests are waiting for their database setup. Ask staff to apply the latest community migration.", 503);
    throw error;
  }
  return toRequest(data as unknown as CrewRoomRequestRow);
}

async function pendingRequest(id: unknown) {
  const requestId = cleanText(id, "Crew-room request", 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new CrewRoomRequestError("That crew-room request is unavailable.", 404);
  }
  const { data, error } = await client().from("crew_room_requests").select(requestColumns()).eq("id", requestId).maybeSingle();
  if (error) throw error;
  if (!data) throw new CrewRoomRequestError("That crew-room request is unavailable.", 404);
  const request = data as unknown as CrewRoomRequestRow;
  if (request.status !== "pending") throw new CrewRoomRequestError("This crew-room request has already been reviewed.", 409);
  return request;
}

function plannedStart(request: CrewRoomRequestRow) {
  const date = request.flight_date?.trim();
  const time = request.departure_time?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const parsed = new Date(`${date}T${time}:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function approveCrewRoomRequest(input: {
  id: unknown;
  staffName: string;
  capacity: unknown;
  status: unknown;
  staffNote: unknown;
}) {
  const request = await pendingRequest(input.id);
  const capacity = cleanCapacity(input.capacity ?? request.requested_capacity);
  const staffNote = cleanText(input.staffNote, "Staff note", 320);
  const start = plannedStart(request);
  const room = await createVoiceRoom({
    name: request.room_name,
    slug: `${request.flight_number}-${request.route_from}-${request.route_to}-${request.id.slice(0, 8)}`,
    description: request.welcome_note,
    eventId: null,
    startsAt: start,
    endsAt: null,
    status: input.status === "open" ? "open" : "scheduled",
    maxParticipants: capacity,
    bannerId: request.banner_id,
    bannerObjectKey: request.banner_object_key,
    bannerContentType: request.banner_content_type,
  });
  const now = new Date().toISOString();
  const { data, error } = await client()
    .from("crew_room_requests")
    .update({
      status: "approved",
      staff_note: staffNote || null,
      reviewed_by: cleanText(input.staffName, "Staff name", 120, "BAV staff"),
      reviewed_at: now,
      voice_room_id: room.id,
      updated_at: now,
    })
    .eq("id", request.id)
    .eq("status", "pending")
    .select(requestColumns())
    .single();
  if (error) throw error;
  await createPilotNotification({
    pilotId: request.pilot_id,
    kind: "operations",
    level: "success",
    title: "Crew room approved",
    body: `Staff approved “${request.room_name}” for ${request.flight_number} ${request.route_from} → ${request.route_to}. ${room.status === "open" ? "It is open now." : "It will appear on the Crew Lounge departure board."}`,
    href: "/crew-lounge",
  });
  return { request: toRequest(data as unknown as CrewRoomRequestRow), room } satisfies { request: CrewRoomRequest; room: VoiceRoom };
}

export async function declineCrewRoomRequest(input: { id: unknown; staffName: string; staffNote: unknown }) {
  const request = await pendingRequest(input.id);
  const staffNote = cleanText(input.staffNote, "Staff note", 320);
  const now = new Date().toISOString();
  const { data, error } = await client()
    .from("crew_room_requests")
    .update({
      status: "declined",
      staff_note: staffNote || "Staff could not schedule this room at the requested time.",
      reviewed_by: cleanText(input.staffName, "Staff name", 120, "BAV staff"),
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", request.id)
    .eq("status", "pending")
    .select(requestColumns())
    .single();
  if (error) throw error;
  await createPilotNotification({
    pilotId: request.pilot_id,
    kind: "operations",
    level: "attention",
    title: "Crew room request reviewed",
    body: staffNote || `Staff could not schedule “${request.room_name}” for this flight. You are welcome to request another time or room.` ,
    href: "/flight-companion",
  });
  return toRequest(data as unknown as CrewRoomRequestRow);
}

export async function readCrewRoomRequestBanner(requestIdValue: unknown) {
  const requestId = cleanText(requestIdValue, "Crew-room request", 64);
  const { data, error } = await client().from("crew_room_requests").select("banner_object_key, banner_content_type").eq("id", requestId).maybeSingle();
  if (error) throw error;
  const row = data as { banner_object_key: string | null; banner_content_type: string | null } | null;
  if (!row?.banner_object_key || (row.banner_content_type !== "image/jpeg" && row.banner_content_type !== "image/png")) return null;
  const { data: file, error: fileError } = await client().storage.from(CREW_ROOM_REQUEST_BUCKET).download(row.banner_object_key);
  if (fileError) throw fileError;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > MAX_BANNER_BYTES) throw new CrewRoomRequestError("The custom crew-room banner is unavailable.", 503);
  return { bytes, contentType: row.banner_content_type };
}

export function crewRoomRequestBannerSummary(request: CrewRoomRequest) {
  return request.hasCustomBanner
    ? { name: "Custom banner", description: "Uploaded by the pilot for staff review." }
    : crewRoomBannerById(request.bannerId);
}
