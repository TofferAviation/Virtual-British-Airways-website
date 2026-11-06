import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { carrierEligible, scheduleAvailable, secondsDisplay, validateAllianceSchedule, type AllianceBookingSnapshot, type AllianceCarrier, type AllianceLedgerEntry, type AllianceSchedule, type AllianceSettings } from "@/lib/alliance";
import { prepareAllianceCredit, type AllianceReview } from "@/lib/alliance-credit";
import { getPilotById, getRewardSettings, type PilotAccount } from "@/lib/pilot-store";
import { calculatePirepReward } from "@/lib/reward-settings";
import { calculatePilotFlightPay, checkAircraftCareerEligibility, getCareerEconomySettings, listPilotQualifications } from "@/lib/pilot-career";
import { buildSimbriefDispatchUrl } from "@/lib/simbrief";
import type { PilotBooking, PilotFlightPlan, PilotPirep } from "@/lib/pilot-operations-store";

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Alliance Operations requires the website database connection.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function checked<T>({ data, error }: { data: T; error: { message: string } | null }): NonNullable<T> { if (error) throw new Error(error.message); if (data === null) throw new Error("Alliance record not found."); return data!; }

export async function getAllianceConfiguration(date = new Date().toISOString().slice(0, 10)) {
  const db = database();
  const [settings, airlines, memberships] = await Promise.all([
    db.from("alliance_settings").select("enabled,policy").eq("singleton", true).single(),
    db.from("alliance_carriers").select("*").order("name"), db.from("alliance_memberships").select("*").order("valid_from", { ascending: false }),
  ]);
  const config = checked(settings) as AllianceSettings;
  const periods = checked(memberships);
  const carriers: AllianceCarrier[] = checked(airlines).map(row => {
    const ranges = periods.filter(m => m.carrier_id === row.id);
    const m = ranges.find(m => m.valid_from <= date && (!m.valid_until || m.valid_until >= date));
    return { id: row.id, name: row.name, iata: row.iata, icao: row.icao, parentId: row.parent_id, enabled: row.enabled, eligible: Boolean(m?.eligible), validFrom: m?.valid_from ?? "9999-12-31", validUntil: m?.valid_until ?? null };
  });
  return { settings: config, carriers, memberships: periods };
}

export async function getAllianceSchedules() {
  const db = database();
  const rows = checked(await db.from("alliance_schedules").select("data").order("id").limit(5000));
  return rows.map(r => r.data as AllianceSchedule);
}
export async function allianceReadiness() {
  try { return { ready: true as const, ...(await getAllianceConfiguration()) }; }
  catch (error) {
    console.error("[alliance] Configuration unavailable", error instanceof Error ? error.message : "Unknown error");
    return { ready: false as const };
  }
}
export async function getAllianceBooking(bookingId: string, pilotId?: string): Promise<AllianceBookingSnapshot | null> {
  let query = database().from("alliance_bookings").select("snapshot,dispatch_approved").eq("booking_id", bookingId);
  if (pilotId) query = query.eq("pilot_id", pilotId);
  const { data, error } = await query.maybeSingle(); if (error) throw error;
  return data ? { ...data.snapshot as AllianceBookingSnapshot, dispatchApproved: data.dispatch_approved } : null;
}
export async function listAllianceLedger(pilotId?: string, pirepId?: string) {
  const db = database(); const rows: Record<string, unknown>[] = [];
  // Supabase's default 1000-row cap must not silently undercount a bank.
  for (let offset = 0; ; offset += 500) {
    let query = db.from("alliance_credit_ledger").select("*").order("created_at", { ascending: false }).order("id");
    if (pilotId) query = query.eq("pilot_id", pilotId); if (pirepId) query = query.eq("pirep_id", pirepId);
    const data = checked(await query.range(offset, offset + 499)); rows.push(...data);
    if (data.length < 500) break;
  }
  return rows.map((r): AllianceLedgerEntry => ({ id: String(r.id), pirepId: String(r.pirep_id), pilotId: String(r.pilot_id), carrierId: String(r.carrier_id), revision: Number(r.revision), kind: r.kind as AllianceLedgerEntry["kind"], seconds: Number(r.seconds), careerSeconds: Number(r.career_seconds), sectors: Number(r.sectors), distanceNm: Number(r.distance_nm), points: Number(r.points), tierPoints: Number(r.tier_points), salary: Number(r.salary), xp: Number(r.xp ?? 0), policy: r.policy as AllianceLedgerEntry["policy"], reason: String(r.reason), actor: String(r.actor), createdAt: String(r.created_at), flight: r.flight as AllianceLedgerEntry["flight"] }));
}

export async function bookAllianceFlight(pilotId: string, scheduleId: string, date: string) {
  const [config, schedules, pilot] = await Promise.all([getAllianceConfiguration(date), getAllianceSchedules(), getPilotById(pilotId)]);
  const schedule = schedules.find(s => s.id === scheduleId);
  if (!pilot || !config.settings.enabled || !schedule || !scheduleAvailable(schedule, date)) throw new Error("This service is not available on the selected date.");
  const operator = config.carriers.find(c => c.id === schedule.operatorId), marketing = config.carriers.find(c => c.id === schedule.marketingCarrierId);
  if (!operator || !marketing || !carrierEligible(operator, date)) throw new Error("The operating airline is not eligible for this date.");
  const mode = pilot.careerExperience.mode;
  if (mode === "realistic_operations") {
    const eligibility = await checkAircraftCareerEligibility(pilot, schedule.aircraft);
    if (!eligibility.eligible) throw new Error(eligibility.reasons.join(" "));
  }
  const snapshot: AllianceBookingSnapshot = { schedule, operator, marketing, policy: config.settings.policy, mode, dispatchApproved: false };
  const now = new Date().toISOString();
  const booking: PilotBooking = { id: randomUUID(), pilotId, routeId: `alliance:${schedule.id}`, flightNumber: schedule.operatingFlightNumber, callsign: schedule.callsign, callsignResolution: null, from: schedule.origin, to: schedule.destination, aircraft: schedule.aircraft, fleetAircraftId: null, registration: null, departure: schedule.departure, arrival: schedule.arrival, duration: secondsDisplay(schedule.blockSeconds), date, scheduleScoringEnabled: false, status: "booked", createdAt: now, alliance: snapshot };
  const plan: PilotFlightPlan = { id: randomUUID(), bookingId: booking.id, pilotId, status: "draft", simbriefPilotId: pilot.simbriefPilotId, simbriefDispatchUrl: pilot.simbriefPilotId ? buildSimbriefDispatchUrl(booking, pilot.name, pilot.simbriefPilotId) : null, simbriefOfpId: null, simbriefOfpUrl: null, route: null, cruiseAltitude: null, alternate: null, simbriefBriefing: null, generatedAt: null, lastSyncedAt: null, createdAt: now, updatedAt: now };
  const { data, error } = await database().rpc("bav_alliance_book", { p_pilot_id: pilotId, p_booking: booking, p_plan: plan, p_snapshot: snapshot });
  if (error) throw new Error(error.message);
  return String(data);
}

/** Exactly one transaction updates source decision, both credits and virtual rewards. */
export async function reviewAlliancePirep(pirep: PilotPirep, review: AllianceReview) {
  const db = database();
  const snapshot = pirep.bookingId ? await getAllianceBooking(pirep.bookingId, pirep.pilotId) : null;
  if (!snapshot) throw new Error("Alliance booking metadata is missing; report held for review.");
  if (review.decision === "accepted" && snapshot.mode === "realistic_operations" && snapshot.policy.requireDispatchApproval && !snapshot.dispatchApproved) throw new Error("This Realistic operation requires an audited dispatch approval before credit.");
  const history = await listAllianceLedger(pirep.pilotId, pirep.id);
  if (review.decision === "accepted" && history.some(e => e.kind === "approval")) {
    if (pirep.status === "accepted" && !history.some(e => e.kind === "reversal")) return; // A retry never pays again.
    throw new Error("This credit was reversed. Its history is retained and cannot be re-approved as a new flight.");
  }
  if (review.decision === "reverse" && history.some(e => e.kind === "reversal")) return;
  const state = checked(await db.from("pilot_state").select("state").eq("singleton", true).single()).state;
  const expected = (state.pilots as PilotAccount[]).find(p => p.id === pirep.pilotId);
  const [pilot, rewards] = await Promise.all([getPilotById(pirep.pilotId), getRewardSettings()]);
  if (!expected || !pilot) throw new Error("Pilot not found.");
  const calculated = calculatePirepReward(pirep, rewards, pilot.flights === 0);
  let salary = 0;
  if (review.decision === "accepted" && snapshot.policy.salary) {
    const [economy, qualifications] = await Promise.all([getCareerEconomySettings(), listPilotQualifications(pilot.id)]);
    salary = calculatePilotFlightPay({ pilot, pirep, economy, hasCommandQualification: qualifications.some(q => q.qualificationDefinitionId === "COMMAND" && q.status === "valid") }).amount;
  }
  // Use the exact raw snapshot as the calculation basis after normalizing
  // defaults; a concurrent change is rejected by the database comparison.
  const mutation = prepareAllianceCredit({ pilot: { ...pilot, ...expected }, pirep, snapshot, history, review, rewards, points: calculated.points, tierPoints: calculated.tierPoints, salary, now: new Date().toISOString() });
  const { error } = await db.rpc("bav_alliance_review", { p_pirep_id: pirep.id, p_expected_status: pirep.status, p_expected_pilot: expected, p_next_pilot: mutation.pilot, p_expected_revision: review.expectedRevision, p_entry: mutation.entry, p_decision: review.decision, p_actor: review.actor, p_reason: review.reason.trim() });
  if (error) throw new Error(error.message.includes("ALLIANCE_CONFLICT") ? "Another update completed while you were reviewing. Refresh and try again; no credit was duplicated." : error.message);
}

export async function importAllianceSchedules(actor: string, raw: unknown) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 500) throw new Error("Import 1–500 schedules at a time.");
  const rows = raw.map(validateAllianceSchedule), ids = new Set(rows.map(r => r.id));
  if (ids.size !== rows.length) throw new Error("Duplicate schedule IDs in import.");
  const { carriers } = await getAllianceConfiguration();
  for (const row of rows) {
    const operating = carriers.find(c => c.id === row.operatorId), marketing = carriers.find(c => c.id === row.marketingCarrierId);
    if (!operating || !marketing) throw new Error(`${row.id}: unknown carrier. Configure its identity first.`);
    if (!row.callsign.startsWith(operating.icao) || !row.flightNumber.startsWith(marketing.iata) || !row.operatingFlightNumber.startsWith(operating.iata)) throw new Error(`${row.id}: callsign/operator or flight number/carrier mismatch.`);
  }
  const { error } = await database().rpc("bav_alliance_admin", { p_action: "import", p_actor: actor, p_payload: rows });
  if (error) throw new Error(error.message);
  return rows.length;
}
export async function allianceAdminChange(actor: string, action: string, payload: unknown) {
  const { error } = await database().rpc("bav_alliance_admin", { p_action: action, p_actor: actor, p_payload: payload });
  if (error) throw new Error(error.message);
}
export async function allianceExportAudit(pilotId: string, format: "json" | "csv", entryCount: number, hash: string) {
  const { error } = await database().from("alliance_exports").insert({ pilot_id: pilotId, format, entry_count: entryCount, payload_sha256: hash });
  if (error) throw error;
}
export async function getAllianceAdminActivity() {
  return checked(await database().from("alliance_audit").select("id,actor,action,reference,details,created_at").order("created_at", { ascending: false }).limit(100));
}
export async function getAllianceStaffBookings() {
  return checked(await database().from("alliance_bookings").select("booking_id,pilot_id,carrier_id,dispatch_approved,created_at").order("created_at", { ascending: false }).limit(1000));
}
export async function getAllianceExportHistory(pilotId: string) {
  return checked(await database().from("alliance_exports").select("id,format,entry_count,created_at").eq("pilot_id", pilotId).order("created_at", { ascending: false }).limit(30));
}
export async function getAllianceSalaryWithheld(pilotId: string) {
  const { data, error } = await database().from("alliance_salary_withholdings").select("remaining").eq("pilot_id", pilotId).maybeSingle();
  if (error) throw error;
  return Number(data?.remaining ?? 0);
}
/** External VA providers require future documented authorization; none is live. */
export interface AllianceTransferProvider {
  id: string;
  authorize(pilotId: string, returnUrl: string): Promise<URL>;
  transfer(authorizedPilotId: string, exportId: string): Promise<{ reference: string }>;
}
export const enabledAllianceTransferProviders: readonly AllianceTransferProvider[] = [];
