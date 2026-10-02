import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { automaticPilotRank, isPilotRank, normalizePilotTypeRatings, type PilotRank, type PilotTypeRating } from "@/lib/pilot-ranks";
import { normaliseStoredAccountBackground, normaliseStoredProfileImage, validateAccountBackground, validateProfileImage } from "@/lib/profile-image";
import { normalizeBavHub } from "@/lib/hubs";
import { PILOT_RULES_VERSION } from "@/lib/pilot-rules";
import { DEFAULT_REWARD_SETTINGS, normalizeRewardSettings, validateRewardSettings, type RewardSettings } from "@/lib/reward-settings";
import { awardsForAcceptedPirep, isHeathrowStation, isPilotCareerAwardId, type PilotCareerAwardId } from "@/lib/pilot-awards";
import { createCareerExperiencePreferences, normalizeCareerExperiencePreferences, validateCareerExperiencePreferences, validateCareerRosterDays, validateMentoringInterest, type CareerExperiencePreferences } from "@/lib/career-experience";

const DATA_DIR = path.join(process.cwd(), ".bav-data");
const PILOT_FILE = path.join(DATA_DIR, "pilots.json");

type PilotState = {
  version: 10;
  nextPilotNumber: number;
  pilots: PilotAccount[];
  passwordResetTokens: PilotPasswordResetToken[];
  deviceSessions: PilotDeviceSession[];
  rewardSettings: RewardSettings;
  hourTransferRequests: PilotHourTransferRequest[];
  hourAdjustments: PilotHourAdjustment[];
  notifications: PilotNotification[];
  mentoringMatches: MentoringMatch[];
  mentorApplications: MentorApplication[];
  /**
   * Flight bookings and SimBrief links share the same durable record as the
   * pilot identity. Kept opaque here so the operations module owns its shape.
   */
  operationsState: unknown | null;
};

export type MentoringProgressNote = { id: string; authorName: string; note: string; createdAt: string };
export type MentoringBonusAward = { pirepId: string; awardedAt: string };
export type MentorRank = "new" | "developing" | "experienced";
export type MentorApplication = {
  id: string;
  pilotId: string;
  status: "pending" | "approved" | "declined" | "withdrawn";
  requestNote: string;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  mentorRank: MentorRank | null;
};
export const MENTOR_RANKS: Record<MentorRank, { label: string; multiplier: number }> = {
  new: { label: "New Mentor", multiplier: 1.25 },
  developing: { label: "Developing Mentor", multiplier: 1.5 },
  experienced: { label: "Experienced Mentor", multiplier: 2 },
};
export type MentoringMatch = {
  id: string;
  mentorPilotId: string;
  learnerPilotId: string;
  status: "active" | "completed" | "cancelled";
  goal: string;
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  endedAt: string | null;
  endedBy: string | null;
  progressNotes: MentoringProgressNote[];
  bonusAwards: MentoringBonusAward[];
};

export type PilotMentoringStatus = {
  application: Pick<MentorApplication, "status" | "requestNote" | "requestedAt" | "reviewedAt" | "mentorRank"> | null;
  match: {
  role: "mentor" | "learner";
  matchId: string;
  counterpartName: string;
  counterpartPilotNumber: string;
  goal: string;
  expiresAt: string;
  progressNotes: MentoringProgressNote[];
  bonusFlightsThisMonth: number;
  mentorRank: MentorRank | null;
  rewardMultiplier: number | null;
  } | null;
};

export const MENTOR_REWARD_MONTHLY_FLIGHT_CAP = 4;
const MENTOR_MINIMUM_BLOCK_MINUTES = 30;
const MENTOR_MATCH_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

type PilotPasswordResetToken = {
  pilotId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

/**
 * One revocable Ember device credential. The random credential itself is
 * never persisted: only its HMAC is stored in the server-side pilot state.
 */
type PilotDeviceSession = {
  id: string;
  pilotId: string;
  tokenHash: string;
  authVersion: number;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
};

export type PilotAward = {
  id: PilotCareerAwardId;
  awardedAt: string;
  sourcePirepId: string;
  /** Present only on event awards, allowing a pilot to earn one for each official event. */
  eventId: string | null;
  eventTitle: string | null;
};

/** A pilot-submitted request to recognise time from a previous virtual airline. */
export type PilotHourTransferRequest = {
  id: string;
  pilotId: string;
  formerVaName: string;
  requestedHours: number;
  /** Link, pilot ID, or other staff-reviewable evidence reference. */
  evidenceReference: string;
  pilotNote: string | null;
  status: "pending" | "approved" | "declined";
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  creditedHours: number | null;
};

/** Immutable audit entry for non-PIREP career-hour credit. */
export type PilotHourAdjustment = {
  id: string;
  pilotId: string;
  hours: number;
  reason: string;
  source: "transfer-review" | "manual";
  actorName: string;
  requestId: string | null;
  createdAt: string;
};

/** A private operational notice shared by the BAV website and Ember. */
export type PilotNotification = {
  id: string;
  pilotId: string;
  kind: "pirep_review" | "transfer_review" | "career_credit" | "operations";
  level: "info" | "success" | "attention";
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};

type PilotStateRow = { state: unknown };

export type PilotAccount = {
  id: string;
  pilotNumber: string;
  email: string;
  name: string;
  passwordHash: string;
  /** Increments on password changes so previously issued sessions stop working. */
  authVersion: number;
  status: "active" | "suspended";
  createdAt: string;
  lastLoginAt: string | null;
  rank: PilotRank;
  rankOverride: PilotRank | null;
  /** Staff-approved long-haul aircraft family qualifications. */
  typeRatings: PilotTypeRating[];
  hub: string;
  tier: string;
  points: number;
  tierPoints: number;
  lifetimeTierPoints: number;
  flights: number;
  hours: number;
  distanceNm: number;
  /** Accepted-flight departures from London Heathrow, used for the specialist award. */
  heathrowDepartures: number;
  averageLanding: number | null;
  bestLanding: number | null;
  onTime: number;
  streak: number;
  /** Numeric SimBrief Pilot ID. This is not a password or an access token. */
  simbriefPilotId: string | null;
  /** Compact, user-selected account avatar stored as a data URL. */
  profileImage: string | null;
  /** Personal image used only behind the pilot's private account summary. */
  accountBackground: string | null;
  /** Explicit consent captured when a pilot creates their BAV account. */
  pilotRulesAcceptedAt: string | null;
  pilotRulesVersion: string | null;
  /** Closed-beta access is granted individually by authorised BAV staff. */
  betaAccess: boolean;
  /** A staff-issued temporary password should be replaced by the pilot. */
  mustChangePassword: boolean;
  /** Permanent BAV career awards earned through accepted flight activity. */
  awards: PilotAward[];
  /** Optional planning preferences. These never grant career privileges. */
  careerExperience: CareerExperiencePreferences;
};

export type PublicPilotAccount = Omit<PilotAccount, "passwordHash" | "authVersion" | "accountBackground">;

function emptyState(): PilotState {
  return {
    version: 10,
    nextPilotNumber: 1,
    pilots: [],
    passwordResetTokens: [],
    deviceSessions: [],
    rewardSettings: { ...DEFAULT_REWARD_SETTINGS },
    hourTransferRequests: [],
    hourAdjustments: [],
    notifications: [],
    mentoringMatches: [],
    mentorApplications: [],
    operationsState: null,
  };
}

function getPilotStateClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function localFallbackAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.BAV_PILOT_LOCAL_FALLBACK === "1";
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalizePilot(raw: Partial<PilotAccount> & Pick<PilotAccount, "id" | "pilotNumber" | "email" | "name" | "passwordHash">): PilotAccount {
  const hours = Number.isFinite(raw.hours) ? Math.max(0, Number(raw.hours)) : 0;
  const rankOverride = isPilotRank(raw.rankOverride) ? raw.rankOverride : null;
  const rank = rankOverride ?? automaticPilotRank(hours);
  return {
    id: raw.id,
    pilotNumber: raw.pilotNumber,
    email: raw.email,
    name: raw.name,
    passwordHash: raw.passwordHash,
    authVersion: Math.max(1, Math.floor(Number(raw.authVersion) || 1)),
    status: raw.status === "suspended" ? "suspended" : "active",
    createdAt: raw.createdAt ?? new Date().toISOString(),
    lastLoginAt: raw.lastLoginAt ?? null,
    rank,
    rankOverride,
    typeRatings: normalizePilotTypeRatings(raw.typeRatings),
    hub: normalizeBavHub(raw.hub),
    tier: raw.tier ?? "Blue",
    points: Number(raw.points) || 0,
    tierPoints: Number(raw.tierPoints) || 0,
    lifetimeTierPoints: Number(raw.lifetimeTierPoints) || 0,
    flights: Number(raw.flights) || 0,
    hours,
    distanceNm: Number(raw.distanceNm) || 0,
    heathrowDepartures: Math.max(0, Math.floor(Number(raw.heathrowDepartures) || 0)),
    averageLanding: raw.averageLanding ?? null,
    bestLanding: raw.bestLanding ?? null,
    onTime: Number.isFinite(raw.onTime) ? Number(raw.onTime) : 100,
    streak: Number(raw.streak) || 0,
    simbriefPilotId: normalizeSimbriefPilotId(raw.simbriefPilotId),
    profileImage: normaliseStoredProfileImage(raw.profileImage),
    accountBackground: normaliseStoredAccountBackground(raw.accountBackground),
    pilotRulesAcceptedAt: typeof raw.pilotRulesAcceptedAt === "string" ? raw.pilotRulesAcceptedAt : null,
    pilotRulesVersion: typeof raw.pilotRulesVersion === "string" ? raw.pilotRulesVersion : null,
    betaAccess: raw.betaAccess === true,
    mustChangePassword: raw.mustChangePassword === true,
    awards: Array.isArray(raw.awards) ? raw.awards.filter((award) => Boolean(
      award && isPilotCareerAwardId(award.id) && typeof award.awardedAt === "string" && typeof award.sourcePirepId === "string",
    )).map((award) => ({
      ...award,
      eventId: typeof award.eventId === "string" ? award.eventId : null,
      eventTitle: typeof award.eventTitle === "string" ? award.eventTitle : null,
    })).filter((award, index, items) => items.findIndex((item) => (
      item.id === award.id && (item.id !== "event-flyer" || item.eventId === award.eventId)
    )) === index) : [],
    careerExperience: normalizeCareerExperiencePreferences(raw.careerExperience, raw.createdAt ?? new Date().toISOString()),
  };
}

function normalizeState(raw?: Partial<PilotState>): PilotState {
  const pilots = Array.isArray(raw?.pilots)
    ? raw.pilots
      .filter((pilot): pilot is PilotAccount => Boolean(pilot?.id && pilot?.pilotNumber && pilot?.email && pilot?.name && pilot?.passwordHash))
      .map((pilot) => normalizePilot(pilot))
    : [];
  const nextPilotNumber = Math.max(
    1,
    Number(raw?.nextPilotNumber) || 0,
    ...pilots.map((pilot) => Number(pilot.pilotNumber.replace(/\D/g, "")) + 1).filter(Number.isFinite),
  );
  const passwordResetTokens = Array.isArray(raw?.passwordResetTokens)
    ? raw.passwordResetTokens
      .filter((item): item is PilotPasswordResetToken => Boolean(
        item &&
          typeof item.pilotId === "string" &&
          typeof item.tokenHash === "string" &&
          typeof item.createdAt === "string" &&
          typeof item.expiresAt === "string",
      ))
      .map((item) => ({
        pilotId: item.pilotId,
        tokenHash: item.tokenHash,
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        usedAt: typeof item.usedAt === "string" ? item.usedAt : null,
      }))
      .filter((item) => pilots.some((pilot) => pilot.id === item.pilotId))
      .slice(-1000)
    : [];
  const now = Date.now();
  const deviceSessions = Array.isArray(raw?.deviceSessions)
    ? raw.deviceSessions
      .filter((item): item is PilotDeviceSession => Boolean(
        item &&
          typeof item.id === "string" &&
          typeof item.pilotId === "string" &&
          typeof item.tokenHash === "string" &&
          typeof item.createdAt === "string" &&
          typeof item.expiresAt === "string",
      ))
      .map((item) => ({
        id: item.id,
        pilotId: item.pilotId,
        tokenHash: item.tokenHash,
        authVersion: Math.max(1, Math.floor(Number(item.authVersion) || 1)),
        createdAt: item.createdAt,
        expiresAt: item.expiresAt,
        lastUsedAt: typeof item.lastUsedAt === "string" ? item.lastUsedAt : item.createdAt,
        revokedAt: typeof item.revokedAt === "string" ? item.revokedAt : null,
      }))
      .filter((item) => {
        const expiration = Date.parse(item.expiresAt);
        return pilots.some((pilot) => pilot.id === item.pilotId) && Number.isFinite(expiration) && expiration > now;
      })
      .slice(-2_000)
    : [];
  const hourTransferRequests = Array.isArray(raw?.hourTransferRequests)
    ? raw.hourTransferRequests
      .filter((item): item is PilotHourTransferRequest => Boolean(
        item &&
          typeof item.id === "string" &&
          typeof item.pilotId === "string" &&
          typeof item.formerVaName === "string" &&
          Number.isFinite(item.requestedHours) &&
          typeof item.evidenceReference === "string" &&
          (item.status === "pending" || item.status === "approved" || item.status === "declined") &&
          typeof item.createdAt === "string",
      ))
      .map((item) => ({
        id: item.id,
        pilotId: item.pilotId,
        formerVaName: item.formerVaName.trim().slice(0, 90),
        requestedHours: Math.round(Math.max(0.1, Number(item.requestedHours)) * 100) / 100,
        evidenceReference: item.evidenceReference.trim().slice(0, 500),
        pilotNote: typeof item.pilotNote === "string" ? item.pilotNote.trim().slice(0, 1_500) || null : null,
        status: item.status,
        createdAt: item.createdAt,
        reviewedAt: typeof item.reviewedAt === "string" ? item.reviewedAt : null,
        reviewedBy: typeof item.reviewedBy === "string" ? item.reviewedBy.trim().slice(0, 100) || null : null,
        reviewNote: typeof item.reviewNote === "string" ? item.reviewNote.trim().slice(0, 1_500) || null : null,
        creditedHours: Number.isFinite(item.creditedHours) ? Math.round(Math.max(0, Number(item.creditedHours)) * 100) / 100 : null,
      }))
      .filter((item) => pilots.some((pilot) => pilot.id === item.pilotId))
      .slice(-2_000)
    : [];
  const hourAdjustments = Array.isArray(raw?.hourAdjustments)
    ? raw.hourAdjustments
      .filter((item): item is PilotHourAdjustment => Boolean(
        item &&
          typeof item.id === "string" &&
          typeof item.pilotId === "string" &&
          Number.isFinite(item.hours) &&
          typeof item.reason === "string" &&
          (item.source === "transfer-review" || item.source === "manual") &&
          typeof item.actorName === "string" &&
          typeof item.createdAt === "string",
      ))
      .map((item) => ({
        id: item.id,
        pilotId: item.pilotId,
        hours: Math.round(Math.max(0.1, Number(item.hours)) * 100) / 100,
        reason: item.reason.trim().slice(0, 1_500),
        source: item.source,
        actorName: item.actorName.trim().slice(0, 100),
        requestId: typeof item.requestId === "string" ? item.requestId : null,
        createdAt: item.createdAt,
      }))
      .filter((item) => pilots.some((pilot) => pilot.id === item.pilotId))
      .slice(-5_000)
    : [];
  const notifications = Array.isArray(raw?.notifications)
    ? raw.notifications
      .filter((item): item is PilotNotification => Boolean(
        item && typeof item.id === "string" && typeof item.pilotId === "string" &&
        (item.kind === "pirep_review" || item.kind === "transfer_review" || item.kind === "career_credit" || item.kind === "operations") &&
        (item.level === "info" || item.level === "success" || item.level === "attention") &&
        typeof item.title === "string" && typeof item.body === "string" && typeof item.createdAt === "string",
      ))
      .map((item) => ({
        id: item.id, pilotId: item.pilotId, kind: item.kind, level: item.level,
        title: item.title.trim().slice(0, 140), body: item.body.trim().slice(0, 800),
        href: typeof item.href === "string" && item.href.startsWith("/") ? item.href.slice(0, 300) : null,
        createdAt: item.createdAt, readAt: typeof item.readAt === "string" ? item.readAt : null,
      }))
      .filter((item) => pilots.some((pilot) => pilot.id === item.pilotId))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 10_000)
    : [];
  const mentoringMatches = Array.isArray(raw?.mentoringMatches)
    ? raw.mentoringMatches.filter((item): item is MentoringMatch => Boolean(
      item && typeof item.id === "string" && typeof item.mentorPilotId === "string" && typeof item.learnerPilotId === "string" &&
      ["active", "completed", "cancelled"].includes(item.status) && typeof item.goal === "string" &&
      typeof item.createdAt === "string" && typeof item.createdBy === "string" && typeof item.expiresAt === "string",
    )).map((item) => ({
      ...item,
      goal: item.goal.trim().slice(0, 500),
      createdBy: item.createdBy.trim().slice(0, 100),
      endedAt: typeof item.endedAt === "string" ? item.endedAt : null,
      endedBy: typeof item.endedBy === "string" ? item.endedBy.trim().slice(0, 100) || null : null,
      progressNotes: Array.isArray(item.progressNotes) ? item.progressNotes.filter((note): note is MentoringProgressNote => Boolean(note && typeof note.id === "string" && typeof note.authorName === "string" && typeof note.note === "string" && typeof note.createdAt === "string")).map((note) => ({ id: note.id, authorName: note.authorName.trim().slice(0, 100), note: note.note.trim().slice(0, 1000), createdAt: note.createdAt })).slice(-50) : [],
      bonusAwards: Array.isArray(item.bonusAwards) ? item.bonusAwards.filter((award): award is MentoringBonusAward => Boolean(award && typeof award.pirepId === "string" && typeof award.awardedAt === "string")).slice(-100) : [],
    })).filter((item) => item.mentorPilotId !== item.learnerPilotId && pilots.some((pilot) => pilot.id === item.mentorPilotId) && pilots.some((pilot) => pilot.id === item.learnerPilotId)).slice(-2_000)
    : [];
  const mentorApplications = Array.isArray(raw?.mentorApplications)
    ? raw.mentorApplications.filter((item): item is MentorApplication => Boolean(
      item && typeof item.id === "string" && typeof item.pilotId === "string" &&
      ["pending", "approved", "declined", "withdrawn"].includes(item.status) &&
      typeof item.requestNote === "string" && typeof item.requestedAt === "string",
    )).map((item) => ({
      id: item.id,
      pilotId: item.pilotId,
      status: item.status,
      requestNote: item.requestNote.trim().slice(0, 1_000),
      requestedAt: item.requestedAt,
      reviewedAt: typeof item.reviewedAt === "string" ? item.reviewedAt : null,
      reviewedBy: typeof item.reviewedBy === "string" ? item.reviewedBy.trim().slice(0, 100) || null : null,
      mentorRank: item.mentorRank === "new" || item.mentorRank === "developing" || item.mentorRank === "experienced" ? item.mentorRank : null,
    })).filter((item) => pilots.some((pilot) => pilot.id === item.pilotId)).slice(-2_000)
    : [];
  return {
    version: 10,
    nextPilotNumber,
    pilots,
    passwordResetTokens,
    deviceSessions,
    rewardSettings: normalizeRewardSettings(raw?.rewardSettings),
    hourTransferRequests,
    hourAdjustments,
    notifications,
    mentoringMatches,
    mentorApplications,
    operationsState: raw?.operationsState && typeof raw.operationsState === "object"
      ? structuredClone(raw.operationsState)
      : null,
  };
}

async function readLocalState(): Promise<PilotState> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(PILOT_FILE, "utf8");
    return normalizeState(JSON.parse(raw) as Partial<PilotState>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return emptyState();
  }
}

async function writeLocalState(state: PilotState) {
  await ensureDataDir();
  await fs.writeFile(PILOT_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function readState(): Promise<PilotState> {
  const client = getPilotStateClient();
  if (client) {
    const { data, error } = await client.from("pilot_state").select("state").eq("singleton", true).maybeSingle();
    if (error) throw error;
    if (data?.state) return normalizeState((data as PilotStateRow).state as Partial<PilotState>);

    // A one-time local import is permitted only when explicitly enabled. It
    // supports moving the existing development state into Supabase without
    // allowing an ephemeral production instance to become authoritative.
    const initial = localFallbackAllowed() ? await readLocalState() : emptyState();
    const { error: createError } = await client.from("pilot_state").upsert({ singleton: true, state: initial });
    if (createError) throw createError;
    return initial;
  }
  if (!localFallbackAllowed()) {
    throw new Error("Pilot account persistence is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY on the website host.");
  }
  return readLocalState();
}

async function writeState(state: PilotState) {
  const normalized = normalizeState(state);
  const client = getPilotStateClient();
  if (client) {
    const { error } = await client.from("pilot_state").upsert({ singleton: true, state: normalized });
    if (error) throw error;
    return;
  }
  if (!localFallbackAllowed()) {
    throw new Error("Pilot account persistence is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY on the website host.");
  }
  await writeLocalState(normalized);
}

/**
 * The pilot-operations module uses this slot for the selected service and
 * SimBrief briefing. It deliberately uses the same Supabase-backed state as
 * pilot identity data, rather than Render's disposable service filesystem.
 */
export async function readPilotOperationsState(): Promise<unknown | null> {
  const state = await readState();
  return state.operationsState === null ? null : structuredClone(state.operationsState);
}

export async function writePilotOperationsState(operationsState: unknown) {
  const state = await readState();
  state.operationsState = operationsState && typeof operationsState === "object"
    ? structuredClone(operationsState)
    : null;
  await writeState(state);
}

function appendPilotNotification(state: PilotState, input: Omit<PilotNotification, "id" | "createdAt" | "readAt">) {
  const notification: PilotNotification = {
    id: randomUUID(),
    pilotId: input.pilotId,
    kind: input.kind,
    level: input.level,
    title: input.title.trim().slice(0, 140),
    body: input.body.trim().slice(0, 800),
    href: input.href?.startsWith("/") ? input.href.slice(0, 300) : null,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  state.notifications.unshift(notification);
  if (state.notifications.length > 10_000) state.notifications.length = 10_000;
  return notification;
}

/** Adds a private BAV notification for a real operational event. */
export async function createPilotNotification(input: Omit<PilotNotification, "id" | "createdAt" | "readAt">) {
  const state = await readState();
  if (!state.pilots.some((pilot) => pilot.id === input.pilotId)) return null;
  const notification = appendPilotNotification(state, input);
  await writeState(state);
  return notification;
}

export async function listPilotNotifications(pilotId: string, limit = 50) {
  const state = await readState();
  return state.notifications
    .filter((notification) => notification.pilotId === pilotId)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, Math.max(1, Math.min(100, Math.floor(limit) || 50)));
}

export async function unreadPilotNotificationCount(pilotId: string) {
  const state = await readState();
  return state.notifications.filter((notification) => notification.pilotId === pilotId && notification.readAt === null).length;
}

export async function markPilotNotificationRead(pilotId: string, notificationId: string) {
  const state = await readState();
  const notification = state.notifications.find((item) => item.id === notificationId && item.pilotId === pilotId);
  if (!notification) return false;
  if (notification.readAt === null) {
    notification.readAt = new Date().toISOString();
    await writeState(state);
  }
  return true;
}

export async function markAllPilotNotificationsRead(pilotId: string) {
  const state = await readState();
  const unread = state.notifications.filter((notification) => notification.pilotId === pilotId && notification.readAt === null);
  if (!unread.length) return 0;
  const now = new Date().toISOString();
  for (const notification of unread) notification.readAt = now;
  await writeState(state);
  return unread.length;
}

/** Returns the live reward framework used for newly accepted BAV PIREPs. */
export async function getRewardSettings() {
  const state = await readState();
  return state.rewardSettings;
}

/** Updates future PIREP rewards. Existing approved flight records are never recalculated. */
export async function updateRewardSettings(input: unknown) {
  const settings = validateRewardSettings(input);
  const state = await readState();
  state.rewardSettings = settings;
  for (const account of state.pilots) {
    if (account.tierPoints >= settings.tierGoldThreshold) account.tier = "Gold";
    else if (account.tierPoints >= settings.tierSilverThreshold) account.tier = "Silver";
    else if (account.tierPoints >= settings.tierBronzeThreshold) account.tier = "Bronze";
    else account.tier = "Blue";
  }
  await writeState(state);
  return settings;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashPilotPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPilotPassword(password: string, stored: string) {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  try {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function registerPilot(input: { name: string; email: string; password: string; hub?: string; acceptPilotRules?: boolean }) {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  const email = normalizeEmail(input.email);
  const password = input.password;
  if (name.length < 2) throw new Error("Please enter your full name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
  if (password.length < 8) throw new Error("Password must contain at least 8 characters.");
  if (input.acceptPilotRules !== true) throw new Error("You must accept the BAV Pilot Rules before creating an account.");

  const state = await readState();
  if (state.pilots.some((pilot) => pilot.email === email)) throw new Error("An account already exists for that email address.");

  const pilotNumber = `BAWVA${String(state.nextPilotNumber).padStart(4, "0")}`;
  const now = new Date().toISOString();
  const account: PilotAccount = {
    id: randomUUID(), pilotNumber, email, name, passwordHash: hashPilotPassword(password), status: "active",
    authVersion: 1,
    createdAt: now, lastLoginAt: now, rank: "Cadet", rankOverride: null, typeRatings: [], hub: normalizeBavHub(input.hub), tier: "Blue",
    points: 0, tierPoints: 0, lifetimeTierPoints: 0, flights: 0, hours: 0, distanceNm: 0, heathrowDepartures: 0,
    averageLanding: null, bestLanding: null, onTime: 100, streak: 0,
    simbriefPilotId: null,
    profileImage: null,
    accountBackground: null,
    pilotRulesAcceptedAt: now,
    pilotRulesVersion: PILOT_RULES_VERSION,
    betaAccess: !closedBetaEnabledForRegistration(),
    mustChangePassword: false,
    awards: [],
    careerExperience: createCareerExperiencePreferences(now),
  };
  state.nextPilotNumber += 1;
  state.pilots.push(account);
  await writeState(state);
  return account;
}

function closedBetaEnabledForRegistration() {
  return ["true", "1", "enabled"].includes((process.env.BAV_CLOSED_BETA_ENABLED ?? "").trim().toLowerCase());
}

function betaInvitePassword() {
  return `BAV-${randomBytes(9).toString("base64url")}`;
}

export async function createClosedBetaPilot(input: { name: string; email: string; temporaryPassword?: string }) {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  const email = normalizeEmail(input.email);
  const temporaryPassword = input.temporaryPassword?.trim() || betaInvitePassword();
  if (name.length < 2) throw new Error("Please enter the pilot's full name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
  if (temporaryPassword.length < 10) throw new Error("The temporary password must be at least 10 characters long.");

  const state = await readState();
  const now = new Date().toISOString();
  let account = state.pilots.find((pilot) => pilot.email === email);
  const existing = Boolean(account);
  if (account) {
    account.name = name;
    account.passwordHash = hashPilotPassword(temporaryPassword);
    account.authVersion += 1;
    account.status = "active";
    account.betaAccess = true;
    account.mustChangePassword = true;
    revokePilotDeviceSessions(state, account.id, now);
  } else {
    const pilotNumber = `BAWVA${String(state.nextPilotNumber).padStart(4, "0")}`;
    account = {
      id: randomUUID(), pilotNumber, email, name, passwordHash: hashPilotPassword(temporaryPassword), status: "active",
      authVersion: 1,
      createdAt: now, lastLoginAt: null, rank: "Cadet", rankOverride: null, typeRatings: [], hub: normalizeBavHub("LHR"), tier: "Blue",
      points: 0, tierPoints: 0, lifetimeTierPoints: 0, flights: 0, hours: 0, distanceNm: 0, heathrowDepartures: 0,
      averageLanding: null, bestLanding: null, onTime: 100, streak: 0, simbriefPilotId: null, profileImage: null, accountBackground: null,
      pilotRulesAcceptedAt: null, pilotRulesVersion: null, betaAccess: true, mustChangePassword: true, awards: [],
      careerExperience: createCareerExperiencePreferences(now),
    };
    state.nextPilotNumber += 1;
    state.pilots.push(account);
  }
  await writeState(state);
  return { pilot: toPublicPilot(account), temporaryPassword, existing };
}

export async function revokeClosedBetaAccess(id: string) {
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  account.betaAccess = false;
  account.authVersion += 1;
  revokePilotDeviceSessions(state, account.id);
  await writeState(state);
  return toPublicPilot(account);
}

export async function findPilotByEmail(email: string) {
  const state = await readState();
  return state.pilots.find((pilot) => pilot.email === normalizeEmail(email)) ?? null;
}

export async function getPilotById(id: string) {
  const state = await readState();
  return state.pilots.find((pilot) => pilot.id === id) ?? null;
}

const ACARS_DEVICE_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function acarsDeviceSessionSecret() {
  const value = process.env.BAV_ACARS_SECRET || process.env.BAV_PILOT_SESSION_SECRET || process.env.BAV_STAFF_SESSION_SECRET;
  if (!value || value.length < 24) throw new Error("BAV_ACARS_SECRET or BAV_PILOT_SESSION_SECRET must be at least 24 characters long.");
  return value;
}

function hashAcarsDeviceSessionToken(token: string) {
  return createHmac("sha256", acarsDeviceSessionSecret()).update(token).digest("hex");
}

function revokePilotDeviceSessions(state: PilotState, pilotId: string, now = new Date().toISOString()) {
  for (const session of state.deviceSessions) {
    if (session.pilotId === pilotId && session.revokedAt === null) session.revokedAt = now;
  }
}

function activeDeviceSession(state: PilotState, token: string, now = Date.now()) {
  const tokenHash = hashAcarsDeviceSessionToken(token);
  return state.deviceSessions.find((session) =>
    session.tokenHash === tokenHash &&
    session.revokedAt === null &&
    Date.parse(session.expiresAt) > now,
  ) ?? null;
}

/** Creates a per-device Ember session and persists only a non-reversible HMAC. */
export async function createAcarsDeviceSession(pilotId: string) {
  const state = await readState();
  const pilot = state.pilots.find((item) => item.id === pilotId && item.status === "active");
  if (!pilot) return null;

  const rawToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const session: PilotDeviceSession = {
    id: randomUUID(),
    pilotId: pilot.id,
    tokenHash: hashAcarsDeviceSessionToken(rawToken),
    authVersion: pilot.authVersion,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ACARS_DEVICE_SESSION_TTL_MS).toISOString(),
    lastUsedAt: now.toISOString(),
    revokedAt: null,
  };
  state.deviceSessions.push(session);
  await writeState(state);
  return { id: session.id, token: rawToken };
}

/** Validates and rotates a device credential, invalidating its previous value. */
export async function renewAcarsDeviceSession(token: string) {
  if (!/^[A-Za-z0-9_-]{40,120}$/.test(token)) return null;
  const state = await readState();
  const session = activeDeviceSession(state, token);
  if (!session) return null;
  const pilot = state.pilots.find((item) => item.id === session.pilotId && item.status === "active");
  if (!pilot || session.authVersion !== pilot.authVersion) return null;

  const nextToken = randomBytes(32).toString("base64url");
  session.tokenHash = hashAcarsDeviceSessionToken(nextToken);
  const now = new Date();
  session.lastUsedAt = now.toISOString();
  session.expiresAt = new Date(now.getTime() + ACARS_DEVICE_SESSION_TTL_MS).toISOString();
  await writeState(state);
  return { pilot, id: session.id, token: nextToken };
}

/** Checks that an access token's backing device session remains active. */
export async function isAcarsDeviceSessionActive(input: { id: string; pilotId: string; authVersion: number }) {
  const state = await readState();
  const session = state.deviceSessions.find((item) => item.id === input.id);
  return Boolean(
    session &&
    session.pilotId === input.pilotId &&
    session.authVersion === input.authVersion &&
    session.revokedAt === null &&
    Date.parse(session.expiresAt) > Date.now(),
  );
}

/** Revokes one device credential. It is safe to call repeatedly. */
export async function revokeAcarsDeviceSession(token: string) {
  if (!/^[A-Za-z0-9_-]{40,120}$/.test(token)) return false;
  const state = await readState();
  const session = activeDeviceSession(state, token);
  if (!session) return false;
  session.revokedAt = new Date().toISOString();
  await writeState(state);
  return true;
}

export async function listPilots() {
  const state = await readState();
  return state.pilots.map(toPublicPilot).sort((a, b) => a.pilotNumber.localeCompare(b.pilotNumber));
}

export async function listPilotHourTransferRequests(pilotId: string) {
  const state = await readState();
  return state.hourTransferRequests
    .filter((request) => request.pilotId === pilotId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function listAllPilotHourTransferRequests() {
  const state = await readState();
  const sortOrder = { pending: 0, approved: 1, declined: 2 } as const;
  return state.hourTransferRequests
    .slice()
    .sort((a, b) => sortOrder[a.status] - sortOrder[b.status] || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function listPilotHourAdjustments(pilotId: string) {
  const state = await readState();
  return state.hourAdjustments
    .filter((adjustment) => adjustment.pilotId === pilotId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function transferText(value: unknown, label: string, minimum: number, maximum: number) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (text.length < minimum) throw new Error(`${label} must contain at least ${minimum} characters.`);
  return text.slice(0, maximum);
}

function transferHours(value: unknown, label: string) {
  const hours = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 50_000) throw new Error(`${label} must be between 0.1 and 50,000 hours.`);
  return Math.round(hours * 100) / 100;
}

/** Submit a single pending request for former-VA time. It always requires staff review. */
export async function createPilotHourTransferRequest(pilotId: string, input: {
  formerVaName?: unknown;
  requestedHours?: unknown;
  evidenceReference?: unknown;
  pilotNote?: unknown;
}) {
  const formerVaName = transferText(input.formerVaName, "Former virtual airline", 2, 90);
  const requestedHours = transferHours(input.requestedHours, "Requested career time");
  const evidenceReference = transferText(input.evidenceReference, "Evidence link or reference", 4, 500);
  const pilotNote = typeof input.pilotNote === "string" ? input.pilotNote.trim().slice(0, 1_500) || null : null;
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === pilotId);
  if (!account) throw new Error("Pilot account not found.");
  if (state.hourTransferRequests.some((request) => request.pilotId === pilotId && request.status === "pending")) {
    throw new Error("You already have a transfer-credit request under review. Please wait for staff to respond.");
  }
  const request: PilotHourTransferRequest = {
    id: randomUUID(),
    pilotId,
    formerVaName,
    requestedHours,
    evidenceReference,
    pilotNote,
    status: "pending",
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    reviewNote: null,
    creditedHours: null,
  };
  state.hourTransferRequests.push(request);
  await writeState(state);
  return request;
}

function addCareerHours(state: PilotState, account: PilotAccount, input: {
  hours: number;
  reason: string;
  source: PilotHourAdjustment["source"];
  actorName: string;
  requestId?: string | null;
}) {
  account.hours = Math.round((account.hours + input.hours) * 100) / 100;
  account.rank = account.rankOverride ?? automaticPilotRank(account.hours);
  const adjustment: PilotHourAdjustment = {
    id: randomUUID(),
    pilotId: account.id,
    hours: input.hours,
    reason: input.reason,
    source: input.source,
    actorName: input.actorName,
    requestId: input.requestId ?? null,
    createdAt: new Date().toISOString(),
  };
  state.hourAdjustments.push(adjustment);
  return adjustment;
}

/** Approve all or part of a pilot's submitted transfer request, or decline it with a staff note. */
export async function reviewPilotHourTransferRequest(input: {
  requestId?: unknown;
  decision?: unknown;
  creditedHours?: unknown;
  reviewNote?: unknown;
  reviewedBy: string;
}) {
  const requestId = transferText(input.requestId, "Transfer request", 8, 100);
  if (input.decision !== "approved" && input.decision !== "declined") throw new Error("Choose whether to approve or decline this request.");
  const reviewedBy = transferText(input.reviewedBy, "Reviewing staff member", 1, 100);
  const reviewNote = typeof input.reviewNote === "string" ? input.reviewNote.trim().slice(0, 1_500) || null : null;
  if (input.decision === "declined" && !reviewNote) throw new Error("Please add a clear note when declining a transfer-credit request.");

  const state = await readState();
  const request = state.hourTransferRequests.find((item) => item.id === requestId);
  if (!request) throw new Error("Transfer-credit request not found.");
  if (request.status !== "pending") throw new Error("This transfer-credit request has already been reviewed.");
  const account = state.pilots.find((pilot) => pilot.id === request.pilotId);
  if (!account) throw new Error("Pilot account not found.");

  const reviewedAt = new Date().toISOString();
  request.status = input.decision;
  request.reviewedAt = reviewedAt;
  request.reviewedBy = reviewedBy;
  request.reviewNote = reviewNote;
  if (input.decision === "approved") {
    const creditedHours = transferHours(input.creditedHours, "Approved career time");
    if (creditedHours > request.requestedHours) throw new Error("Approved career time cannot exceed the pilot's requested amount.");
    request.creditedHours = creditedHours;
    addCareerHours(state, account, {
      hours: creditedHours,
      reason: `Former VA transfer approved: ${request.formerVaName}${reviewNote ? ` — ${reviewNote}` : ""}`,
      source: "transfer-review",
      actorName: reviewedBy,
      requestId: request.id,
    });
  } else {
    request.creditedHours = null;
  }
  appendPilotNotification(state, {
    pilotId: account.id,
    kind: "transfer_review",
    level: input.decision === "approved" ? "success" : "attention",
    title: input.decision === "approved" ? "Transfer credit approved" : "Transfer credit declined",
    body: input.decision === "approved"
      ? `${request.creditedHours?.toFixed(1) ?? "0.0"} career hours from ${request.formerVaName} were added by ${reviewedBy}.`
      : `BAV Operations reviewed your transfer request for ${request.formerVaName}.${reviewNote ? ` ${reviewNote}` : ""}`,
    href: "/account/profile",
  });
  await writeState(state);
  return { request, pilot: toPublicPilot(account) };
}

/** Add exceptional career time without creating a flight, PIREP, points, or awards. */
export async function addManualPilotHours(pilotId: string, input: {
  hoursToAdd: unknown;
  reason: unknown;
  addedBy: string;
  requestId?: unknown;
}) {
  const hours = transferHours(input.hoursToAdd, "Career time to add");
  const reason = transferText(input.reason, "Adjustment reason", 3, 1_500);
  const addedBy = transferText(input.addedBy, "Authorising staff member", 1, 100);
  const requestId = typeof input.requestId === "string" && input.requestId.trim() ? input.requestId.trim().slice(0, 100) : null;
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === pilotId);
  if (!account) throw new Error("Pilot account not found.");
  if (requestId && !state.hourTransferRequests.some((request) => request.id === requestId && request.pilotId === pilotId)) {
    throw new Error("The selected transfer request does not belong to this pilot.");
  }
  addCareerHours(state, account, { hours, reason, source: "manual", actorName: addedBy, requestId });
  appendPilotNotification(state, {
    pilotId: account.id,
    kind: "career_credit",
    level: "success",
    title: "Career hours added",
    body: `${hours.toFixed(1)} career hours were added by ${addedBy}. Reason: ${reason}`,
    href: "/account",
  });
  await writeState(state);
  return toPublicPilot(account);
}

export async function markPilotLogin(id: string) {
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) return;
  account.lastLoginAt = new Date().toISOString();
  await writeState(state);
}

export async function updatePilotProfile(id: string, input: { name: string; email: string; hub?: string; profileImage?: string | null; accountBackground?: string | null }) {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  const email = normalizeEmail(input.email);
  if (name.length < 2) throw new Error("Please enter your full name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  if (state.pilots.some((pilot) => pilot.id !== id && pilot.email === email)) throw new Error("That email address is already in use.");
  account.name = name;
  account.email = email;
  if (input.hub !== undefined) account.hub = normalizeBavHub(input.hub);
  if (input.profileImage !== undefined) account.profileImage = validateProfileImage(input.profileImage);
  if (input.accountBackground !== undefined) account.accountBackground = validateAccountBackground(input.accountBackground);
  await writeState(state);
  return toPublicPilot(account);
}

function normalizeSimbriefPilotId(value: unknown) {
  const id = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return /^\d{1,12}$/.test(id) ? id : null;
}

export async function updatePilotSimbriefId(id: string, simbriefPilotId: string) {
  const normalized = normalizeSimbriefPilotId(simbriefPilotId);
  if (simbriefPilotId.trim() && !normalized) throw new Error("Enter your numeric SimBrief Pilot ID, or leave it blank to remove the link.");
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  account.simbriefPilotId = normalized;
  await writeState(state);
  return toPublicPilot(account);
}

export async function updatePilotCareerExperiencePreferences(id: string, input: unknown) {
  const values = validateCareerExperiencePreferences(input);
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  account.careerExperience = { ...account.careerExperience, ...values, updatedAt: new Date().toISOString() };
  await writeState(state);
  return account.careerExperience;
}

export async function updatePilotCareerRoster(id: string, input: unknown) {
  const rosterDays = validateCareerRosterDays(input);
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  account.careerExperience = { ...account.careerExperience, rosterDays, updatedAt: new Date().toISOString() };
  await writeState(state);
  return account.careerExperience;
}

export async function updatePilotMentoringInterest(id: string, input: unknown) {
  const mentoringInterest = validateMentoringInterest(input);
  const requestNote = input && typeof input === "object" && typeof (input as { mentorApplicationNote?: unknown }).mentorApplicationNote === "string"
    ? (input as { mentorApplicationNote: string }).mentorApplicationNote.trim().replace(/\s+/g, " ").slice(0, 1_000)
    : "";
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  const latestApplication = [...state.mentorApplications].reverse().find((application) => application.pilotId === id) ?? null;
  const now = new Date().toISOString();
  if (mentoringInterest === "mentor" && !latestApplication?.status.includes("approved") && latestApplication?.status !== "pending") {
    if (requestNote.length < 20) throw new Error("Tell staff briefly why you would like to mentor before submitting your request.");
    state.mentorApplications.push({ id: randomUUID(), pilotId: id, status: "pending", requestNote, requestedAt: now, reviewedAt: null, reviewedBy: null, mentorRank: null });
    appendPilotNotification(state, { pilotId: id, kind: "operations", level: "info", title: "Mentor application received", body: "Staff will review your mentoring request before you can be matched with a new pilot.", href: "/account/career" });
  }
  if (mentoringInterest !== "mentor" && latestApplication?.status === "pending") {
    latestApplication.status = "withdrawn";
    latestApplication.reviewedAt = now;
  }
  account.careerExperience = { ...account.careerExperience, mentoringInterest, updatedAt: now };
  await writeState(state);
  return account.careerExperience;
}

function mentoringIsActive(match: MentoringMatch, now = Date.now()) {
  return match.status === "active" && Date.parse(match.expiresAt) > now;
}

function calendarMonth(timestamp: string) {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? "" : `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function mentorAwardsThisMonth(state: PilotState, mentorPilotId: string, now = new Date().toISOString()) {
  const month = calendarMonth(now);
  return state.mentoringMatches.filter((match) => match.mentorPilotId === mentorPilotId).flatMap((match) => match.bonusAwards).filter((award) => calendarMonth(award.awardedAt) === month).length;
}

export async function listMentoringMatches() {
  const state = await readState();
  return [...state.mentoringMatches].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listMentorApplications() {
  const state = await readState();
  return [...state.mentorApplications].sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
}

function latestMentorApplication(state: PilotState, pilotId: string) {
  return [...state.mentorApplications].reverse().find((application) => application.pilotId === pilotId) ?? null;
}

function approvedMentorApplication(state: PilotState, pilotId: string) {
  const application = latestMentorApplication(state, pilotId);
  return application?.status === "approved" && application.mentorRank ? application : null;
}

export async function reviewMentorApplication(input: { applicationId: string; status: "approved" | "declined"; mentorRank?: MentorRank; staffName: string }) {
  const state = await readState();
  const application = state.mentorApplications.find((item) => item.id === input.applicationId && item.status === "pending");
  if (!application) throw new Error("That mentor application is no longer awaiting review.");
  if (input.status === "approved" && !input.mentorRank) throw new Error("Choose a mentoring level before approving this application.");
  application.status = input.status;
  application.mentorRank = input.status === "approved" ? input.mentorRank ?? null : null;
  application.reviewedAt = new Date().toISOString();
  application.reviewedBy = input.staffName.trim().slice(0, 100);
  const account = state.pilots.find((pilot) => pilot.id === application.pilotId);
  if (account) {
    const level = application.mentorRank ? MENTOR_RANKS[application.mentorRank] : null;
    appendPilotNotification(state, { pilotId: account.id, kind: "operations", level: input.status === "approved" ? "success" : "attention", title: input.status === "approved" ? "Mentor application approved" : "Mentor application not approved", body: input.status === "approved" && level ? `You are approved as a ${level.label} and can now be matched with new pilots. Your staff-controlled reward is ${level.multiplier}× on eligible accepted Ember flights.` : "Staff have reviewed your mentoring application. You may update your request in Career when you are ready.", href: "/account/career" });
  }
  await writeState(state);
  return application;
}

export async function updateMentorRank(input: { pilotId: string; mentorRank: MentorRank; staffName: string }) {
  const state = await readState();
  const application = approvedMentorApplication(state, input.pilotId);
  if (!application) throw new Error("This pilot does not have an approved mentor application.");
  application.mentorRank = input.mentorRank;
  application.reviewedAt = new Date().toISOString();
  application.reviewedBy = input.staffName.trim().slice(0, 100);
  const level = MENTOR_RANKS[input.mentorRank];
  appendPilotNotification(state, { pilotId: input.pilotId, kind: "operations", level: "success", title: "Mentoring level updated", body: `Staff have set your mentoring level to ${level.label}. Eligible accepted Ember flights now receive ${level.multiplier}× standard VA and Tier Points while you have an active match.`, href: "/account/career" });
  await writeState(state);
  return application;
}

export async function getPilotMentoringStatus(pilotId: string): Promise<PilotMentoringStatus> {
  const state = await readState();
  const application = latestMentorApplication(state, pilotId);
  const match = state.mentoringMatches.find((item) => mentoringIsActive(item) && (item.mentorPilotId === pilotId || item.learnerPilotId === pilotId));
  if (!match) return { application: application ? { status: application.status, requestNote: application.requestNote, requestedAt: application.requestedAt, reviewedAt: application.reviewedAt, mentorRank: application.mentorRank } : null, match: null };
  const role = match.mentorPilotId === pilotId ? "mentor" : "learner";
  const counterpart = state.pilots.find((pilot) => pilot.id === (role === "mentor" ? match.learnerPilotId : match.mentorPilotId));
  if (!counterpart) return { application: application ? { status: application.status, requestNote: application.requestNote, requestedAt: application.requestedAt, reviewedAt: application.reviewedAt, mentorRank: application.mentorRank } : null, match: null };
  const approvedApplication = role === "mentor" ? approvedMentorApplication(state, pilotId) : null;
  return {
    application: application ? { status: application.status, requestNote: application.requestNote, requestedAt: application.requestedAt, reviewedAt: application.reviewedAt, mentorRank: application.mentorRank } : null,
    match: {
      role,
      matchId: match.id,
      counterpartName: counterpart.name,
      counterpartPilotNumber: counterpart.pilotNumber,
      goal: match.goal,
      expiresAt: match.expiresAt,
      progressNotes: match.progressNotes,
      bonusFlightsThisMonth: role === "mentor" ? mentorAwardsThisMonth(state, pilotId) : 0,
      mentorRank: approvedApplication?.mentorRank ?? (role === "mentor" ? "new" : null),
      rewardMultiplier: role === "mentor" ? (approvedApplication?.mentorRank ? MENTOR_RANKS[approvedApplication.mentorRank].multiplier : MENTOR_RANKS.new.multiplier) : null,
    },
  };
}

export async function createMentoringMatch(input: { mentorPilotId: string; learnerPilotId: string; goal: string; staffName: string }) {
  const mentorPilotId = input.mentorPilotId.trim();
  const learnerPilotId = input.learnerPilotId.trim();
  const goal = input.goal.trim().replace(/\s+/g, " ").slice(0, 500);
  if (!mentorPilotId || !learnerPilotId || mentorPilotId === learnerPilotId) throw new Error("Choose two different pilot accounts.");
  if (goal.length < 8) throw new Error("Add a clear mentoring goal before creating the match.");
  const state = await readState();
  const mentor = state.pilots.find((pilot) => pilot.id === mentorPilotId);
  const learner = state.pilots.find((pilot) => pilot.id === learnerPilotId);
  if (!mentor || !learner || mentor.status !== "active" || learner.status !== "active") throw new Error("Both pilots must have active BAV accounts.");
  if (mentor.careerExperience.mentoringInterest !== "mentor" || !approvedMentorApplication(state, mentorPilotId)) throw new Error("That mentor application must be approved and still opted in before creating a match.");
  if (learner.careerExperience.mentoringInterest !== "learn") throw new Error("That pilot has not requested mentoring.");
  if (state.mentoringMatches.some((match) => mentoringIsActive(match) && match.learnerPilotId === learnerPilotId)) throw new Error("This pilot already has an active mentoring match.");
  if (state.mentoringMatches.filter((match) => mentoringIsActive(match) && match.mentorPilotId === mentorPilotId).length >= 3) throw new Error("A mentor can support up to three active pilots at once.");
  const now = new Date();
  const match: MentoringMatch = { id: randomUUID(), mentorPilotId, learnerPilotId, status: "active", goal, createdAt: now.toISOString(), createdBy: input.staffName.trim().slice(0, 100), expiresAt: new Date(now.getTime() + MENTOR_MATCH_DURATION_MS).toISOString(), endedAt: null, endedBy: null, progressNotes: [], bonusAwards: [] };
  state.mentoringMatches.push(match);
  appendPilotNotification(state, { pilotId: mentorPilotId, kind: "operations", level: "success", title: "Mentoring match confirmed", body: `You are now supporting ${learner.name}. Eligible accepted Ember flights can receive the mentor reward while this match is active.`, href: "/account/career" });
  appendPilotNotification(state, { pilotId: learnerPilotId, kind: "operations", level: "success", title: "Mentoring match confirmed", body: `${mentor.name} is now listed as your BAV mentor. Your shared goal is available in Career.`, href: "/account/career" });
  await writeState(state);
  return match;
}

export async function addMentoringProgressNote(input: { matchId: string; note: string; staffName: string }) {
  const note = input.note.trim().replace(/\s+/g, " ").slice(0, 1000);
  if (note.length < 3) throw new Error("Add a short progress note.");
  const state = await readState();
  const match = state.mentoringMatches.find((item) => item.id === input.matchId && mentoringIsActive(item));
  if (!match) throw new Error("That mentoring match is no longer active.");
  const progress: MentoringProgressNote = { id: randomUUID(), authorName: input.staffName.trim().slice(0, 100), note, createdAt: new Date().toISOString() };
  match.progressNotes.push(progress);
  const mentor = state.pilots.find((pilot) => pilot.id === match.mentorPilotId);
  const learner = state.pilots.find((pilot) => pilot.id === match.learnerPilotId);
  for (const pilotId of [match.mentorPilotId, match.learnerPilotId]) appendPilotNotification(state, { pilotId, kind: "operations", level: "info", title: "Mentoring progress updated", body: note, href: "/account/career" });
  void mentor; void learner;
  await writeState(state);
  return progress;
}

export async function endMentoringMatch(input: { matchId: string; status: "completed" | "cancelled"; staffName: string }) {
  const state = await readState();
  const match = state.mentoringMatches.find((item) => item.id === input.matchId && mentoringIsActive(item));
  if (!match) throw new Error("That mentoring match is no longer active.");
  match.status = input.status;
  match.endedAt = new Date().toISOString();
  match.endedBy = input.staffName.trim().slice(0, 100);
  await writeState(state);
  return match;
}

/** Claims a capped mentor reward before an accepted PIREP is credited. The pilot cannot call this path. */
export async function claimMentorPirepReward(input: { pilotId: string; pirepId: string; source: "manual" | "acars"; blockMinutes: number }) {
  if (input.source !== "acars" || input.blockMinutes < MENTOR_MINIMUM_BLOCK_MINUTES) return null;
  const state = await readState();
  const match = state.mentoringMatches.find((item) => mentoringIsActive(item) && item.mentorPilotId === input.pilotId);
  const approval = approvedMentorApplication(state, input.pilotId);
  // Existing staff-created matches remain safely on the original New Mentor rate after this upgrade.
  const multiplier = approval?.mentorRank ? MENTOR_RANKS[approval.mentorRank].multiplier : MENTOR_RANKS.new.multiplier;
  if (!match || state.pilots.find((pilot) => pilot.id === input.pilotId)?.careerExperience.mentoringInterest !== "mentor") return null;
  if (mentorAwardsThisMonth(state, input.pilotId) >= MENTOR_REWARD_MONTHLY_FLIGHT_CAP) return null;
  if (state.mentoringMatches.some((item) => item.bonusAwards.some((award) => award.pirepId === input.pirepId))) return null;
  match.bonusAwards.push({ pirepId: input.pirepId, awardedAt: new Date().toISOString() });
  await writeState(state);
  return { multiplier, matchId: match.id };
}

export async function changePilotPassword(id: string, currentPassword: string, newPassword: string) {
  if (newPassword.length < 8) throw new Error("New password must contain at least 8 characters.");
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  if (!verifyPilotPassword(currentPassword, account.passwordHash)) throw new Error("Your current password is incorrect.");
  account.passwordHash = hashPilotPassword(newPassword);
  account.authVersion += 1;
  account.mustChangePassword = false;
  revokePilotDeviceSessions(state, account.id);
  await writeState(state);
}

function passwordResetSecret() {
  const secret = (process.env.BAV_PASSWORD_RESET_SECRET ?? process.env.BAV_PILOT_SESSION_SECRET ?? "").trim();
  if (secret.length < 32) throw new Error("Password-reset security is not configured on this server.");
  return secret;
}

function hashPasswordResetToken(token: string) {
  return createHmac("sha256", passwordResetSecret()).update(token).digest("hex");
}

function removeExpiredResetTokens(state: PilotState, now = Date.now()) {
  state.passwordResetTokens = state.passwordResetTokens.filter((item) => {
    const expiresAt = Date.parse(item.expiresAt);
    return Number.isFinite(expiresAt) && (item.usedAt === null ? expiresAt > now : now - expiresAt < 24 * 60 * 60 * 1000);
  });
}

/**
 * Creates a single-use reset token without ever persisting the token itself.
 * The caller must treat the returned token as secret and send it directly to
 * the verified pilot email address.
 */
export async function createPilotPasswordReset(email: string) {
  const state = await readState();
  const pilot = state.pilots.find((item) => item.email === normalizeEmail(email) && item.status === "active");
  if (!pilot) return null;

  const now = Date.now();
  removeExpiredResetTokens(state, now);
  const latest = state.passwordResetTokens
    .filter((item) => item.pilotId === pilot.id && item.usedAt === null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (latest && now - Date.parse(latest.createdAt) < 60_000) {
    // Avoid issuing a stream of replacement links while keeping the public
    // endpoint response identical for known and unknown addresses.
    return null;
  }

  state.passwordResetTokens = state.passwordResetTokens.filter((item) => item.pilotId !== pilot.id || item.usedAt !== null);
  const token = randomBytes(32).toString("base64url");
  state.passwordResetTokens.push({
    pilotId: pilot.id,
    tokenHash: hashPasswordResetToken(token),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    usedAt: null,
  });
  await writeState(state);
  return { pilot, token };
}

export async function resetPilotPassword(token: string, newPassword: string) {
  if (newPassword.length < 10) throw new Error("Use a password with at least 10 characters.");
  if (!/^[A-Za-z0-9_-]{40,120}$/.test(token)) throw new Error("This password-reset link is invalid or has expired.");

  const state = await readState();
  const now = Date.now();
  removeExpiredResetTokens(state, now);
  const tokenHash = hashPasswordResetToken(token);
  const reset = state.passwordResetTokens.find((item) => item.tokenHash === tokenHash && item.usedAt === null && Date.parse(item.expiresAt) > now);
  if (!reset) {
    await writeState(state);
    throw new Error("This password-reset link is invalid or has expired.");
  }

  const pilot = state.pilots.find((item) => item.id === reset.pilotId && item.status === "active");
  if (!pilot) throw new Error("This password-reset link is invalid or has expired.");

  pilot.passwordHash = hashPilotPassword(newPassword);
  pilot.authVersion += 1;
  pilot.mustChangePassword = false;
  revokePilotDeviceSessions(state, pilot.id);
  reset.usedAt = new Date(now).toISOString();
  state.passwordResetTokens = state.passwordResetTokens.filter((item) => item.pilotId !== pilot.id || item === reset);
  await writeState(state);
  return toPublicPilot(pilot);
}

export async function setPilotStatus(id: string, status: PilotAccount["status"]) {
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  account.status = status;
  if (status === "suspended") revokePilotDeviceSessions(state, account.id);
  await writeState(state);
  return toPublicPilot(account);
}

export async function updatePilotAdminFields(id: string, input: { rankOverride?: PilotRank | null; typeRatings?: PilotTypeRating[]; hub?: string; tier?: string }) {
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === id);
  if (!account) throw new Error("Pilot account not found.");
  if (input.rankOverride !== undefined) {
    account.rankOverride = input.rankOverride;
    account.rank = input.rankOverride ?? automaticPilotRank(account.hours);
  }
  if (input.typeRatings !== undefined) account.typeRatings = normalizePilotTypeRatings(input.typeRatings);
  if (input.hub) account.hub = normalizeBavHub(input.hub);
  if (input.tier) account.tier = input.tier.trim().slice(0, 30);
  await writeState(state);
  return toPublicPilot(account);
}

export function isFirstFlightAwardEligible(account: Pick<PilotAccount, "flights" | "awards"> | null | undefined) {
  return Boolean(account && account.flights === 0 && !account.awards.some((award) => award.id === "first-flight"));
}

export async function applyApprovedPirepStats(pilotId: string, input: {
  blockMinutes: number;
  distanceNm: number;
  landingFpm: number | null;
  points: number;
  tierPoints: number;
  sourcePirepId: string;
  from: string;
  aircraft: string;
  eventAward?: { eventId: string; eventTitle: string };
}) {
  const state = await readState();
  const account = state.pilots.find((pilot) => pilot.id === pilotId);
  if (!account) throw new Error("Pilot not found.");
  const previousFlights = account.flights;
  account.flights += 1;
  account.hours = Math.round((account.hours + input.blockMinutes / 60) * 100) / 100;
  account.distanceNm += Math.max(0, Math.round(input.distanceNm));
  if (isHeathrowStation(input.from)) account.heathrowDepartures += 1;
  account.points += Math.max(0, input.points);
  account.tierPoints += Math.max(0, input.tierPoints);
  account.lifetimeTierPoints += Math.max(0, input.tierPoints);
  account.streak += 1;
  const awardedAt = new Date().toISOString();
  const earnedAwards = awardsForAcceptedPirep({
    flights: account.flights,
    totalDistanceNm: account.distanceNm,
    heathrowDepartures: account.heathrowDepartures,
    aircraft: input.aircraft,
    distanceNm: input.distanceNm,
  }, account.awards);
  for (const award of earnedAwards) {
    account.awards.push({ id: award.id, awardedAt, sourcePirepId: input.sourcePirepId, eventId: null, eventTitle: null });
  }
  if (input.eventAward && !account.awards.some((award) => award.id === "event-flyer" && award.eventId === input.eventAward?.eventId)) {
    account.awards.push({
      id: "event-flyer",
      awardedAt,
      sourcePirepId: input.sourcePirepId,
      eventId: input.eventAward.eventId,
      eventTitle: input.eventAward.eventTitle,
    });
  }
  if (input.landingFpm != null) {
    account.averageLanding = account.averageLanding == null ? input.landingFpm : Math.round((account.averageLanding * previousFlights + input.landingFpm) / Math.max(1, account.flights));
    account.bestLanding = account.bestLanding == null ? input.landingFpm : Math.max(account.bestLanding, input.landingFpm);
  }
  account.rank = account.rankOverride ?? automaticPilotRank(account.hours);
  if (account.tierPoints >= state.rewardSettings.tierGoldThreshold) account.tier = "Gold";
  else if (account.tierPoints >= state.rewardSettings.tierSilverThreshold) account.tier = "Silver";
  else if (account.tierPoints >= state.rewardSettings.tierBronzeThreshold) account.tier = "Bronze";
  else account.tier = "Blue";
  await writeState(state);
  return account;
}

export function toPublicPilot(account: PilotAccount): PublicPilotAccount {
  const { passwordHash: _passwordHash, authVersion: _authVersion, accountBackground: _accountBackground, ...pilot } = account;
  void _passwordHash;
  void _authVersion;
  void _accountBackground;
  return pilot;
}
