import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SupportedSimulator } from "@/lib/acars-contract";

export type CrewLinkRole = "captain" | "first_officer" | "observer";
export type CrewLinkStatus = "open" | "active" | "closed" | "expired";

export type CrewLinkMember = {
  pilotId: string;
  pilotNumber: string;
  pilotName: string;
  role: CrewLinkRole;
  simulator: SupportedSimulator | null;
  simulatorConnected: boolean;
  joinedAt: string;
  lastSeenAt: string;
};

export type CrewLinkSession = {
  id: string;
  inviteCode: string | null;
  hostPilotId: string;
  flightNumber: string;
  from: string;
  to: string;
  aircraft: string;
  status: CrewLinkStatus;
  controlOwnerPilotId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  members: CrewLinkMember[];
};

type SessionRow = {
  id: string; invite_code: string; host_pilot_id: string; booking_id: string;
  flight_number: string; departure_station: string; arrival_station: string; aircraft: string;
  status: CrewLinkStatus; control_owner_pilot_id: string; expires_at: string;
  created_at: string; updated_at: string;
};
type MemberRow = {
  crew_link_session_id: string; pilot_id: string; pilot_number: string; pilot_name: string;
  role: CrewLinkRole; simulator: SupportedSimulator | null; simulator_connected: boolean;
  joined_at: string; last_seen_at: string;
};

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("CrewLink requires the configured BAV operational data service.");
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

function isExpired(session: Pick<SessionRow, "expires_at">) {
  return Date.parse(session.expires_at) <= Date.now();
}

function createInviteCode() {
  // Deliberately omit ambiguous characters such as O/0 and I/1.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join("");
}

async function readSession(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("crew_link_sessions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as SessionRow | null;
}

async function readMembers(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("crew_link_members").select("*").eq("crew_link_session_id", id).is("left_at", null).order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MemberRow[];
}

function toSession(row: SessionRow, members: MemberRow[], includeInviteCode: boolean): CrewLinkSession {
  return {
    id: row.id,
    inviteCode: includeInviteCode ? row.invite_code : null,
    hostPilotId: row.host_pilot_id,
    flightNumber: row.flight_number,
    from: row.departure_station,
    to: row.arrival_station,
    aircraft: row.aircraft,
    status: row.status,
    controlOwnerPilotId: row.control_owner_pilot_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    members: members.map(member => ({
      pilotId: member.pilot_id,
      pilotNumber: member.pilot_number,
      pilotName: member.pilot_name,
      role: member.role,
      simulator: member.simulator,
      simulatorConnected: member.simulator_connected,
      joinedAt: member.joined_at,
      lastSeenAt: member.last_seen_at,
    })),
  };
}

async function viewForPilot(db: SupabaseClient, row: SessionRow, pilotId: string) {
  const members = await readMembers(db, row.id);
  if (!members.some(member => member.pilot_id === pilotId)) return null;
  return toSession(row, members, row.host_pilot_id === pilotId);
}

export async function createCrewLinkSession(input: {
  pilotId: string; pilotNumber: string; pilotName: string; bookingId: string;
  flightNumber: string; from: string; to: string; aircraft: string; simulator: SupportedSimulator | null;
}) {
  const db = client();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const id = randomUUID();
  let session: SessionRow | null = null;
  for (let attempt = 0; attempt < 3 && !session; attempt += 1) {
    const inviteCode = createInviteCode();
    const { data, error } = await db.from("crew_link_sessions").insert({
      id, invite_code: inviteCode, host_pilot_id: input.pilotId, booking_id: input.bookingId,
      flight_number: input.flightNumber, departure_station: input.from, arrival_station: input.to,
      aircraft: input.aircraft, status: "open", control_owner_pilot_id: input.pilotId,
      expires_at: expiresAt, created_at: now, updated_at: now,
    }).select("*").maybeSingle();
    if (!error && data) session = data as SessionRow;
    else if (error && !String(error.message).toLowerCase().includes("duplicate")) throw error;
  }
  if (!session) throw new Error("CrewLink could not create a private invite. Please try again.");
  const { error: memberError } = await db.from("crew_link_members").insert({
    id: randomUUID(), crew_link_session_id: session.id, pilot_id: input.pilotId,
    pilot_number: input.pilotNumber, pilot_name: input.pilotName, role: "captain",
    simulator: input.simulator, simulator_connected: input.simulator !== null,
    joined_at: now, last_seen_at: now, left_at: null,
  });
  if (memberError) throw memberError;
  return toSession(session, await readMembers(db, session.id), true);
}

export async function joinCrewLinkSession(input: {
  inviteCode: string; pilotId: string; pilotNumber: string; pilotName: string; simulator: SupportedSimulator | null;
}) {
  const db = client();
  const inviteCode = input.inviteCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const { data, error } = await db.from("crew_link_sessions").select("*").eq("invite_code", inviteCode).in("status", ["open", "active"]).maybeSingle();
  if (error) throw error;
  const session = data as SessionRow | null;
  if (!session || isExpired(session)) {
    if (session) await db.from("crew_link_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", session.id);
    throw new Error("That CrewLink invite has expired or is no longer available.");
  }
  const existingMembers = await readMembers(db, session.id);
  const existing = existingMembers.find(member => member.pilot_id === input.pilotId);
  const occupiedFirstOfficer = existingMembers.some(member => member.role === "first_officer" && member.pilot_id !== input.pilotId);
  const role: CrewLinkRole = existing?.role ?? (occupiedFirstOfficer ? "observer" : "first_officer");
  const now = new Date().toISOString();
  if (existing) {
    const { error: updateError } = await db.from("crew_link_members").update({
      pilot_number: input.pilotNumber, pilot_name: input.pilotName, simulator: input.simulator,
      simulator_connected: input.simulator !== null, last_seen_at: now,
    }).eq("crew_link_session_id", session.id).eq("pilot_id", input.pilotId).is("left_at", null);
    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await db.from("crew_link_members").insert({
      id: randomUUID(), crew_link_session_id: session.id, pilot_id: input.pilotId,
      pilot_number: input.pilotNumber, pilot_name: input.pilotName, role, simulator: input.simulator,
      simulator_connected: input.simulator !== null, joined_at: now, last_seen_at: now, left_at: null,
    });
    if (insertError) throw insertError;
  }
  const { data: updated, error: updateSessionError } = await db.from("crew_link_sessions").update({ status: "active", updated_at: now }).eq("id", session.id).select("*").single();
  if (updateSessionError) throw updateSessionError;
  return toSession(updated as SessionRow, await readMembers(db, session.id), false);
}

export async function getCrewLinkSessionForPilot(pilotId: string) {
  const db = client();
  const { data, error } = await db.from("crew_link_members").select("crew_link_session_id").eq("pilot_id", pilotId).is("left_at", null).order("last_seen_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.crew_link_session_id) return null;
  const session = await readSession(db, data.crew_link_session_id as string);
  if (!session || session.status === "closed" || session.status === "expired") return null;
  if (isExpired(session)) {
    await db.from("crew_link_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", session.id);
    return null;
  }
  return viewForPilot(db, session, pilotId);
}

export async function updateCrewLinkPresence(input: { sessionId: string; pilotId: string; simulator: SupportedSimulator | null; simulatorConnected: boolean; }) {
  const db = client();
  const session = await readSession(db, input.sessionId);
  if (!session || isExpired(session) || ["closed", "expired"].includes(session.status)) throw new Error("This CrewLink session is no longer active.");
  const now = new Date().toISOString();
  const { error } = await db.from("crew_link_members").update({ simulator: input.simulator, simulator_connected: input.simulatorConnected, last_seen_at: now }).eq("crew_link_session_id", input.sessionId).eq("pilot_id", input.pilotId).is("left_at", null);
  if (error) throw error;
  await db.from("crew_link_sessions").update({ updated_at: now }).eq("id", input.sessionId);
  return viewForPilot(db, session, input.pilotId);
}

export async function transferCrewLinkControl(input: { sessionId: string; captainPilotId: string; targetPilotId: string; }) {
  const db = client();
  const session = await readSession(db, input.sessionId);
  if (!session || isExpired(session) || session.host_pilot_id !== input.captainPilotId) throw new Error("Only the CrewLink captain can hand over operational control.");
  const members = await readMembers(db, session.id);
  const target = members.find(member => member.pilot_id === input.targetPilotId);
  if (!target || target.role === "observer") throw new Error("Operational control can only be handed to the assigned First Officer.");
  const now = new Date().toISOString();
  const { data, error } = await db.from("crew_link_sessions").update({ control_owner_pilot_id: target.pilot_id, updated_at: now }).eq("id", session.id).select("*").single();
  if (error) throw error;
  return toSession(data as SessionRow, members, true);
}

export async function leaveCrewLinkSession(input: { sessionId: string; pilotId: string; }) {
  const db = client();
  const session = await readSession(db, input.sessionId);
  if (!session) return;
  const now = new Date().toISOString();
  if (session.host_pilot_id === input.pilotId) {
    const { error } = await db.from("crew_link_sessions").update({ status: "closed", updated_at: now }).eq("id", session.id);
    if (error) throw error;
    return;
  }
  const { error } = await db.from("crew_link_members").update({ left_at: now, last_seen_at: now }).eq("crew_link_session_id", session.id).eq("pilot_id", input.pilotId).is("left_at", null);
  if (error) throw error;
}
