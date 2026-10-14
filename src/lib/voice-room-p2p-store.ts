import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

const MAX_PARTICIPANTS = 4;
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

type VoicePeerSession = VoicePeer & {
  roomId: string;
  token: string;
  joinedAt: number;
  lastSeenAt: number;
};

type VoicePeerState = {
  sessions: Map<string, VoicePeerSession>;
  queues: Map<string, VoiceSignal[]>;
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

const root = globalThis as typeof globalThis & { __bavVoicePeerState?: VoicePeerState };

function state() {
  if (!root.__bavVoicePeerState) root.__bavVoicePeerState = { sessions: new Map(), queues: new Map() };
  return root.__bavVoicePeerState;
}

function safeEqual(left: string, right: string) {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && timingSafeEqual(first, second);
}

function publicPeer(session: VoicePeerSession): VoicePeer {
  return {
    sessionId: session.sessionId,
    pilotId: session.pilotId,
    pilotNumber: session.pilotNumber,
    name: session.name,
    profileImage: session.profileImage,
  };
}

function deleteSession(sessionId: string) {
  const current = state();
  current.sessions.delete(sessionId);
  current.queues.delete(sessionId);
  for (const [targetId, signals] of current.queues) {
    const remaining = signals.filter((signal) => signal.from.sessionId !== sessionId);
    if (remaining.length) current.queues.set(targetId, remaining);
    else current.queues.delete(targetId);
  }
}

function purgeExpired() {
  const oldestAllowed = Date.now() - SESSION_IDLE_MS;
  for (const session of state().sessions.values()) {
    if (session.lastSeenAt < oldestAllowed) deleteSession(session.sessionId);
  }
}

function roomParticipants(roomId: string) {
  purgeExpired();
  return [...state().sessions.values()]
    .filter((session) => session.roomId === roomId)
    .sort((left, right) => left.joinedAt - right.joinedAt)
    .map(publicPeer);
}

function requireSession(input: { roomId: string; pilotId: string; sessionId: unknown; token: unknown }) {
  purgeExpired();
  if (typeof input.sessionId !== "string" || typeof input.token !== "string") {
    throw new VoicePeerError("Your voice session is missing. Join the room again.", 401);
  }
  const session = state().sessions.get(input.sessionId);
  if (!session || session.roomId !== input.roomId || session.pilotId !== input.pilotId || !safeEqual(session.token, input.token)) {
    throw new VoicePeerError("Your voice session has expired. Join the room again.", 401);
  }
  session.lastSeenAt = Date.now();
  return session;
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

function opaqueToken() {
  return randomBytes(32).toString("base64url");
}

function sessionId() {
  return randomBytes(18).toString("base64url");
}

/** This is routing data only. Media stays directly between participating browsers. */
export function joinVoicePeerRoom(input: {
  roomId: string;
  pilotId: string;
  pilotNumber: string;
  name: string;
  profileImage?: string | null;
}) {
  purgeExpired();
  for (const existing of state().sessions.values()) {
    if (existing.roomId === input.roomId && existing.pilotId === input.pilotId) deleteSession(existing.sessionId);
  }
  if (roomParticipants(input.roomId).length >= MAX_PARTICIPANTS) {
    throw new VoicePeerError("This small-room beta is at its four-pilot limit. Try again when a seat opens.", 409);
  }
  const now = Date.now();
  const session: VoicePeerSession = {
    sessionId: sessionId(),
    token: opaqueToken(),
    roomId: input.roomId,
    pilotId: input.pilotId,
    pilotNumber: input.pilotNumber,
    name: input.name,
    profileImage: input.profileImage?.trim() || null,
    joinedAt: now,
    lastSeenAt: now,
  };
  state().sessions.set(session.sessionId, session);
  return { session: publicPeer(session), token: session.token, participants: roomParticipants(input.roomId), maxParticipants: MAX_PARTICIPANTS };
}

export function pollVoicePeerRoom(input: { roomId: string; pilotId: string; sessionId: unknown; token: unknown }): VoicePeerSnapshot {
  const session = requireSession(input);
  const queue = state().queues.get(session.sessionId) ?? [];
  state().queues.delete(session.sessionId);
  return { participants: roomParticipants(session.roomId), signals: queue };
}

export function previewVoicePeerRoom(roomId: string) {
  return { participantCount: roomParticipants(roomId).length, maxParticipants: MAX_PARTICIPANTS };
}

export function sendVoicePeerSignal(input: {
  roomId: string;
  pilotId: string;
  sessionId: unknown;
  token: unknown;
  targetSessionId: unknown;
  kind: unknown;
  payload: unknown;
}) {
  const sender = requireSession(input);
  if (typeof input.targetSessionId !== "string" || input.targetSessionId === sender.sessionId) {
    throw new VoicePeerError("Choose another pilot in this room.", 400);
  }
  const target = state().sessions.get(input.targetSessionId);
  if (!target || target.roomId !== sender.roomId) return { delivered: false };
  const queue = state().queues.get(target.sessionId) ?? [];
  if (queue.length >= MAX_QUEUED_SIGNALS) queue.shift();
  queue.push({ id: opaqueToken(), from: publicPeer(sender), kind: cleanSignalKind(input.kind), payload: cleanSignalPayload(input.payload) });
  state().queues.set(target.sessionId, queue);
  return { delivered: true };
}

export function leaveVoicePeerRoom(input: { roomId: string; pilotId: string; sessionId: unknown; token: unknown }) {
  const session = requireSession(input);
  deleteSession(session.sessionId);
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
    // WebRTC ICE uses `stun:host:port`, rather than a `stun://` web URL.
    .filter((value) => /^stuns?:[^\s]+$/i.test(value));

  // A malformed optional setting must not take the approved beta offline.
  // STUN supplies only connection-routing metadata; media stays P2P.
  // Production should configure the managed TURN relay above so restrictive
  // networks can still complete an encrypted media connection.
  return [{ urls: urls.length ? urls : [fallback] }];
}
