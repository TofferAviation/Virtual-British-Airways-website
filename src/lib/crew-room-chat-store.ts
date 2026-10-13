import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const CREW_ROOM_CHANNEL = "crew-lounge" as const;
export type CrewRoomChannel = typeof CREW_ROOM_CHANNEL;

type CrewRoomMessageRow = {
  id: string;
  channel: CrewRoomChannel;
  pilot_id: string;
  pilot_number: string;
  pilot_name: string;
  pilot_rank: string;
  body: string;
  created_at: string;
};

export type CrewRoomMessage = {
  id: string;
  channel: CrewRoomChannel;
  pilotId: string;
  pilotNumber: string;
  pilotName: string;
  rank: string;
  body: string;
  createdAt: string;
};

export class CrewRoomChatError extends Error {
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

function parseChannel(value: unknown): CrewRoomChannel {
  if (value !== CREW_ROOM_CHANNEL) {
    throw new CrewRoomChatError("That Crew Lounge channel is not available.", 404);
  }
  return CREW_ROOM_CHANNEL;
}

function cleanMessage(value: unknown) {
  if (typeof value !== "string") {
    throw new CrewRoomChatError("Write a message before sending it to the Crew Lounge.", 400);
  }

  const clean = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!clean) throw new CrewRoomChatError("Write a message before sending it to the Crew Lounge.", 400);
  if (clean.length > 600) throw new CrewRoomChatError("Crew Lounge messages are limited to 600 characters.", 400);
  if (clean.split("\n").length > 8) throw new CrewRoomChatError("Keep Crew Lounge messages to eight lines or fewer.", 400);
  return clean;
}

function toMessage(row: CrewRoomMessageRow): CrewRoomMessage {
  return {
    id: row.id,
    channel: row.channel,
    pilotId: row.pilot_id,
    pilotNumber: row.pilot_number,
    pilotName: row.pilot_name,
    rank: row.pilot_rank,
    body: row.body,
    createdAt: row.created_at,
  };
}

export async function listCrewRoomMessages(channelValue: unknown, requestedLimit: unknown) {
  const channel = parseChannel(channelValue);
  const requested = typeof requestedLimit === "number" ? requestedLimit : Number(requestedLimit);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested), 60)) : 60;
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const db = client();
  const { data, error } = await db
    .from("crew_room_messages")
    .select("id, channel, pilot_id, pilot_number, pilot_name, pilot_rank, body, created_at")
    .eq("channel", channel)
    .is("deleted_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as CrewRoomMessageRow[]).reverse().map(toMessage);
}

export async function createCrewRoomMessage(input: {
  channel: unknown;
  body: unknown;
  pilotId: string;
  pilotNumber: string;
  pilotName: string;
  pilotRank: string | null | undefined;
}) {
  const channel = parseChannel(input.channel);
  const body = cleanMessage(input.body);
  const db = client();
  const cutoff = new Date(Date.now() - 30 * 1000).toISOString();
  const { count, error: rateError } = await db
    .from("crew_room_messages")
    .select("id", { count: "exact", head: true })
    .eq("pilot_id", input.pilotId)
    .gte("created_at", cutoff);
  if (rateError) throw rateError;
  if ((count ?? 0) >= 3) {
    throw new CrewRoomChatError("The lounge is taking a breather—please wait a moment before sending another message.", 429);
  }

  const createdAt = new Date().toISOString();
  const row = {
    id: randomUUID(),
    channel,
    pilot_id: input.pilotId,
    pilot_number: input.pilotNumber,
    pilot_name: input.pilotName,
    pilot_rank: input.pilotRank?.trim() || "BAV pilot",
    body,
    created_at: createdAt,
  };
  const { data, error } = await db
    .from("crew_room_messages")
    .insert(row)
    .select("id, channel, pilot_id, pilot_number, pilot_name, pilot_rank, body, created_at")
    .single();
  if (error) throw error;
  return toMessage(data as CrewRoomMessageRow);
}
