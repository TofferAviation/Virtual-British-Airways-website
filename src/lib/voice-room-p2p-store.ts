import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_MAX_PARTICIPANTS = 4;
const MAX_CONFIGURED_PARTICIPANTS = 8;
const SESSION_IDLE_MS = 90_000;
const MAX_SIGNAL_BYTES = 12_000;
const MAX_QUEUED_SIGNALS = 80;

export type VoicePeer = {
  sessionId: string;
  pilotId: string;
  pilotNumber: string;
  name: string;
  profileImage: string | null;
};

export type VoiceSignalKind = "offer" | "answer" | "candidate";

export type VoiceSignal = {
  id: string;
  from: VoicePeer;
  kind: VoiceSignalKind;
  payload: Record<string, unknown>;
};

type VoicePeerSessionRow = {
  id: string;
  room_id: string;
  pilot_id: string;
  pilot_number: string;
  name: string;
  profile_image: string | null;
  token_hash: string;
  joined_at: string;
  last_seen_at: string;
};

type VoiceSignalRow = {
  id: string;
  sender_session_id: string;
  kind: VoiceSignalKind;
  payload: Record<string, unknown>;
};

type VoicePeerSnapshot = {
  participants: VoicePeer[];
  signals: VoiceSignal[];
};

type VoiceIceServer = {
  urls: string[];
  username?: string;
  credential?: string;
};

export class VoicePeerError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new VoicePeerError("BAV's voice service is not configured yet. Please ask staff to complete the private-call setup.", 503);
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function isMissingVoicePeerSchema(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const detail = error as { code?: unknown; message?: unknown };
  const code = typeof detail.code === "string" ? detail.code : "";
  const message = typeof detail.message === "string" ? detail.message : "";
  return code === "42P01" || code === "PGRST205" || message.includes("crew_voice_peer_sessions") || message.includes("crew_voice_peer_signals");
}

function rethrowStoreError(error: unknown): never {
  if (error instanceof VoicePeerError) throw error;
  if (isMissingVoicePeerSchema(error)) {
    throw new VoicePeerError("BAV voice needs its reliability database update before calls can start. Ask staff to apply the latest Crew Lounge migration.", 503);
  }
  throw new VoicePeerError("BAV's call setup service is temporarily unavailable. Please try again shortly.", 503);
}

function safeEqual(left: string, right: string) {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && timingSafeEqual(first, second);
}

function publicPeer(session: VoicePeerSessionRow): VoicePeer {
  return {
    sessionId: session.id,
    pilotId: session.pilot_id,
    pilotNumber: session.pilot_number,
    name: session.name,
    profileImage: session.profile_image,
  };
}

function sessionColumns() {
  return "id, room_id, pilot_id, pilot_number, name, profile_image, token_hash, joined_at, last_seen_at";
}

function cleanText(value: unknown, maximum: number, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, maximum) || fallback;
}

function opaqueToken() {
  return randomBytes(32).toString("base64url");
}

function sessionId() {
  return randomBytes(18).toString("base64url");
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function cleanSignalPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new VoicePeerError("That call setup message is invalid.", 400);
  }
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new VoicePeerError("That call setup message could not be read.", 400);
  }
  if (!encoded || Buffer.byteLength(encoded, "utf8") > MAX_SIGNAL_BYTES) {
    throw new VoicePeerError("That call setup message is too large.", 413);
  }
  return JSON.parse(encoded) as Record<string, unknown>;
}

function cleanSignalKind(value: unknown): VoiceSignalKind {
  if (value === "offer" || value === "answer" || value === "candidate") return value;
  throw new VoicePeerError("That call setup message has an unknown type.", 400);
}

async function purgeExpired(db: SupabaseClient) {
  const cutoff = new Date(Date.now() - SESSION_IDLE_MS).toISOString();
  const { error } = await db.from("crew_voice_peer_sessions").delete().lt("last_seen_at", cutoff);
  if (error) rethrowStoreError(error);
}

async function roomParticipants(db: SupabaseClient, roomId: string) {
  const cutoff = new Date(Date.now() - SESSION_IDLE_MS).toISOString();
  const { data, error } = await db
    .from("crew_voice_peer_sessions")
    .select(sessionColumns())
    .eq("room_id", roomId)
    .gte("last_seen_at", cutoff)
    .order("joined_at", { ascending: true });
  if (error) rethrowStoreError(error);
  return ((data ?? []) as unknown as VoicePeerSessionRow[]).map(publicPeer);
}

async function requireSession(db: SupabaseClient, input: { roomId: string; pilotId: string; sessionId: unknown; token: unknown }) {
  if (typeof input.sessionId !== "string" || typeof input.token !== "string") {
    throw new VoicePeerError("Your voice session is missing. Join the room again.", 401);
  }
  const { data, error } = await db
    .from("crew_voice_peer_sessions")
    .select(sessionColumns())
    .eq("id", input.sessionId)
    .maybeSingle();
  if (error) rethrowStoreError(error);
  const session = data as VoicePeerSessionRow | null;
  if (!session || session.room_id !== input.roomId || session.pilot_id !== input.pilotId || !safeEqual(session.token_hash, tokenHash(input.token))) {
    throw new VoicePeerError("Your voice session has expired. Join the room again.", 401);
  }
  const { error: updateError } = await db.from("crew_voice_peer_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", session.id);
  if (updateError) rethrowStoreError(updateError);
  return session;
}

/** Durable routing data only. Audio, camera and screen media stay in WebRTC. */
export async function joinVoicePeerRoom(input: {
  roomId: string;
  pilotId: string;
  pilotNumber: string;
  name: string;
  profileImage?: string | null;
  maxParticipants?: number;
}) {
  try {
    const db = client();
    await purgeExpired(db);
    const { error: removeError } = await db.from("crew_voice_peer_sessions").delete().eq("room_id", input.roomId).eq("pilot_id", input.pilotId);
    if (removeError) rethrowStoreError(removeError);

    const { count, error: countError } = await db
      .from("crew_voice_peer_sessions")
      .select("id", { count: "exact", head: true })
      .eq("room_id", input.roomId);
    if (countError) rethrowStoreError(countError);
    const maxParticipants = Number.isInteger(input.maxParticipants) && (input.maxParticipants ?? 0) >= 2 && (input.maxParticipants ?? 0) <= MAX_CONFIGURED_PARTICIPANTS
      ? input.maxParticipants!
      : DEFAULT_MAX_PARTICIPANTS;
    if ((count ?? 0) >= maxParticipants) {
      throw new VoicePeerError(`This crew room is at its ${maxParticipants}-pilot limit. Try again when a seat opens.`, 409);
    }

    const token = opaqueToken();
    const now = new Date().toISOString();
    const { data, error } = await db
      .from("crew_voice_peer_sessions")
      .insert({
        id: sessionId(),
        room_id: input.roomId,
        pilot_id: cleanText(input.pilotId, 128),
        pilot_number: cleanText(input.pilotNumber, 64, "BAV pilot"),
        name: cleanText(input.name, 160, "BAV pilot"),
        profile_image: cleanText(input.profileImage, 2_048) || null,
        token_hash: tokenHash(token),
        joined_at: now,
        last_seen_at: now,
      })
      .select(sessionColumns())
      .single();
    if (error) rethrowStoreError(error);
    const session = data as unknown as VoicePeerSessionRow;
    return { session: publicPeer(session), token, participants: await roomParticipants(db, input.roomId), maxParticipants };
  } catch (error) {
    rethrowStoreError(error);
  }
}

export async function pollVoicePeerRoom(input: { roomId: string; pilotId: string; sessionId: unknown; token: unknown }): Promise<VoicePeerSnapshot> {
  try {
    const db = client();
    await purgeExpired(db);
    const session = await requireSession(db, input);
    const { data, error } = await db
      .from("crew_voice_peer_signals")
      .select("id, sender_session_id, kind, payload")
      .eq("target_session_id", session.id)
      .order("created_at", { ascending: true })
      .limit(MAX_QUEUED_SIGNALS);
    if (error) rethrowStoreError(error);
    const rows = (data ?? []) as VoiceSignalRow[];
    const senderIds = [...new Set(rows.map((row) => row.sender_session_id))];
    const senders = new Map<string, VoicePeer>();
    if (senderIds.length) {
      const { data: senderRows, error: senderError } = await db
        .from("crew_voice_peer_sessions")
        .select(sessionColumns())
        .in("id", senderIds);
      if (senderError) rethrowStoreError(senderError);
      for (const sender of (senderRows ?? []) as unknown as VoicePeerSessionRow[]) senders.set(sender.id, publicPeer(sender));
    }
    if (rows.length) {
      const { error: clearError } = await db.from("crew_voice_peer_signals").delete().in("id", rows.map((row) => row.id));
      if (clearError) rethrowStoreError(clearError);
    }
    return {
      participants: await roomParticipants(db, session.room_id),
      signals: rows.flatMap((row) => {
        const from = senders.get(row.sender_session_id);
        return from ? [{ id: row.id, from, kind: row.kind, payload: row.payload }] : [];
      }),
    };
  } catch (error) {
    rethrowStoreError(error);
  }
}

export async function previewVoicePeerRoom(roomId: string, maxParticipants?: number) {
  try {
    const db = client();
    await purgeExpired(db);
    const participants = await roomParticipants(db, roomId);
    const configuredLimit = Number.isInteger(maxParticipants) && (maxParticipants ?? 0) >= 2 && (maxParticipants ?? 0) <= MAX_CONFIGURED_PARTICIPANTS
      ? maxParticipants!
      : DEFAULT_MAX_PARTICIPANTS;
    return { participantCount: participants.length, maxParticipants: configuredLimit };
  } catch (error) {
    rethrowStoreError(error);
  }
}

export async function sendVoicePeerSignal(input: {
  roomId: string;
  pilotId: string;
  sessionId: unknown;
  token: unknown;
  targetSessionId: unknown;
  kind: unknown;
  payload: unknown;
}) {
  try {
    const db = client();
    const sender = await requireSession(db, input);
    if (typeof input.targetSessionId !== "string" || input.targetSessionId === sender.id) {
      throw new VoicePeerError("Choose another pilot in this room.", 400);
    }
    const { data: target, error: targetError } = await db
      .from("crew_voice_peer_sessions")
      .select("id, room_id")
      .eq("id", input.targetSessionId)
      .maybeSingle();
    if (targetError) rethrowStoreError(targetError);
    if (!target || target.room_id !== sender.room_id) return { delivered: false };

    const { count, error: countError } = await db
      .from("crew_voice_peer_signals")
      .select("id", { count: "exact", head: true })
      .eq("target_session_id", input.targetSessionId);
    if (countError) rethrowStoreError(countError);
    if ((count ?? 0) >= MAX_QUEUED_SIGNALS) {
      const { data: oldest, error: oldestError } = await db
        .from("crew_voice_peer_signals")
        .select("id")
        .eq("target_session_id", input.targetSessionId)
        .order("created_at", { ascending: true })
        .limit(1);
      if (oldestError) rethrowStoreError(oldestError);
      if (oldest?.[0]?.id) {
        const { error: removeError } = await db.from("crew_voice_peer_signals").delete().eq("id", oldest[0].id);
        if (removeError) rethrowStoreError(removeError);
      }
    }

    const { error } = await db.from("crew_voice_peer_signals").insert({
      target_session_id: input.targetSessionId,
      sender_session_id: sender.id,
      kind: cleanSignalKind(input.kind),
      payload: cleanSignalPayload(input.payload),
    });
    if (error) rethrowStoreError(error);
    return { delivered: true };
  } catch (error) {
    rethrowStoreError(error);
  }
}

export async function leaveVoicePeerRoom(input: { roomId: string; pilotId: string; sessionId: unknown; token: unknown }) {
  try {
    const db = client();
    const session = await requireSession(db, input);
    const { error } = await db.from("crew_voice_peer_sessions").delete().eq("id", session.id);
    if (error) rethrowStoreError(error);
  } catch (error) {
    rethrowStoreError(error);
  }
}

function configuredCloudflareTurn() {
  const keyId = process.env.BAV_CLOUDFLARE_TURN_KEY_ID?.trim();
  const apiToken = process.env.BAV_CLOUDFLARE_TURN_KEY_TOKEN?.trim();
  if (!keyId && !apiToken) return null;
  if (!keyId || !apiToken) {
    throw new VoicePeerError("BAV's voice relay is only partly configured. Please ask staff to complete the setup.", 503);
  }
  return { keyId, apiToken };
}

function cloudflareIceServers(value: unknown): VoiceIceServer[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { iceServers?: unknown }).iceServers)) {
    throw new VoicePeerError("BAV's voice relay returned an invalid connection setup. Please try again shortly.", 503);
  }

  const servers = (value as { iceServers: unknown[] }).iceServers.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as { urls?: unknown; username?: unknown; credential?: unknown };
    const urls = (Array.isArray(raw.urls) ? raw.urls : [raw.urls])
      .filter((url): url is string => typeof url === "string")
      .map((url) => url.trim())
      .filter((url) => /^(stuns?|turns?):[^\s]+$/i.test(url));
    if (!urls.length) return [];
    const server: VoiceIceServer = { urls };
    if (typeof raw.username === "string" && typeof raw.credential === "string") {
      server.username = raw.username;
      server.credential = raw.credential;
    }
    return [server];
  });

  const hasRelay = servers.some((server) => server.urls.some((url) => /^turns?:/i.test(url)) && server.username && server.credential);
  if (!hasRelay) {
    throw new VoicePeerError("BAV's voice relay returned no usable relay route. Please try again shortly.", 503);
  }
  return servers;
}

async function managedVoiceRelayIceServers(config: { keyId: string; apiToken: string }) {
  let response: Response;
  try {
    response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(config.keyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 7200 }),
        cache: "no-store",
      },
    );
  } catch {
    throw new VoicePeerError("BAV's voice relay is temporarily unavailable. Please try again shortly.", 503);
  }

  if (!response.ok) {
    throw new VoicePeerError("BAV's voice relay is temporarily unavailable. Please try again shortly.", 503);
  }
  try {
    return cloudflareIceServers(await response.json());
  } catch (error) {
    if (error instanceof VoicePeerError) throw error;
    throw new VoicePeerError("BAV's voice relay returned an unreadable connection setup. Please try again shortly.", 503);
  }
}

export async function voicePeerIceServers(): Promise<VoiceIceServer[]> {
  const cloudflareTurn = configuredCloudflareTurn();
  if (cloudflareTurn) return managedVoiceRelayIceServers(cloudflareTurn);

  const configured = process.env.BAV_P2P_STUN_URL?.trim();
  const fallback = "stun:stun.l.google.com:19302";
  const urls = (configured ? configured.split(",") : [fallback])
    .map((value) => value.trim())
    .filter((value) => /^stuns?:[^\s]+$/i.test(value));
  return [{ urls: urls.length ? urls : [fallback] }];
}
