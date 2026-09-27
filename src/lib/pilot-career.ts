import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CAREER_ECONOMY, DEFAULT_QUALIFICATION_DEFINITIONS, aircraftFamilyForModel, ratingForAircraft, type CareerEconomySettings, type CareerQualificationDefinition, type QualificationRequirements } from "@/lib/career-defaults";
import { PILOT_RANKS, type PilotRank } from "@/lib/pilot-ranks";
import type { PilotAccount } from "@/lib/pilot-store";
import type { PilotPirep } from "@/lib/pilot-operations-store";

const DATA_DIR = path.join(process.cwd(), ".bav-data");
const LOCAL_FILE = path.join(DATA_DIR, "pilot-career.json");

// Recognise the original launch prices so the revised BAV virtual market
// baseline can be applied once without overwriting a staff-set rate.
const LEGACY_DEFAULT_TRAINING_COSTS: Record<string, { training: number; recurrent: number }> = {
  E190: { training: 8000, recurrent: 1800 },
  A320_FAMILY: { training: 10000, recurrent: 2200 },
  B787: { training: 18000, recurrent: 3800 },
  B777: { training: 20000, recurrent: 4200 },
  A350: { training: 22000, recurrent: 4600 },
  A380: { training: 27500, recurrent: 5500 },
};

const PREVIOUS_SCALED_TRAINING_COSTS: Record<string, { training: number; recurrent: number }> = {
  E190: { training: 7500, recurrent: 1000 },
  A320_FAMILY: { training: 10000, recurrent: 1250 },
  B787: { training: 12500, recurrent: 1600 },
  B777: { training: 12500, recurrent: 1600 },
  A350: { training: 15000, recurrent: 1900 },
  A380: { training: 17500, recurrent: 2200 },
};

const PREVIOUS_MARKET_TRAINING_COSTS: Record<string, { training: number; recurrent: number }> = {
  E190: { training: 7500, recurrent: 1000 },
  A320_FAMILY: { training: 8000, recurrent: 1100 },
  B787: { training: 15000, recurrent: 1800 },
  B777: { training: 15500, recurrent: 1850 },
  A350: { training: 16500, recurrent: 2000 },
  A380: { training: 14000, recurrent: 1700 },
};

export type FinanceTransactionCategory = "flight_pay" | "bonus" | "allowance" | "training_payment" | "qualification_payment" | "recurrent_training" | "refund" | "manual_adjustment" | "reversal";
export type TrainingApplicationStatus = "not_eligible" | "eligible" | "application_submitted" | "awaiting_approval" | "approved" | "payment_pending" | "training_assigned" | "training_in_progress" | "check_flight_required" | "check_flight_submitted" | "check_flight_review" | "passed" | "failed" | "type_rating_issued" | "expired" | "suspended";
export type QualificationStatus = "valid" | "expiring_soon" | "recurrent_due" | "expired" | "suspended";
export type QualificationSource = "training" | "grandfathered" | "manual";

export type PilotFinanceAccount = {
  pilotId: string;
  currency: "GBP";
  currentBalance: number;
  lifetimeEarnings: number;
  currentMonthEarnings: number;
  previousMonthEarnings: number;
  updatedAt: string;
};

export type PilotFinanceTransaction = {
  id: string;
  pilotId: string;
  idempotencyKey: string;
  category: FinanceTransactionCategory;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  relatedPirepId: string | null;
  relatedTrainingApplicationId: string | null;
  relatedQualificationId: string | null;
  reversedTransactionId: string | null;
  description: string;
  createdAutomatically: boolean;
  staffMember: string | null;
  createdAt: string;
};

export type PilotQualification = {
  id: string;
  pilotId: string;
  qualificationDefinitionId: string;
  status: QualificationStatus;
  source: QualificationSource;
  issuedAt: string;
  issuedBy: string | null;
  trainingApplicationId: string | null;
  checkFlightPirepId: string | null;
  validFrom: string;
  validUntil: string | null;
  lastRecurrentAt: string | null;
  nextRecurrentAt: string | null;
  staffNote: string | null;
};

export type TrainingApplication = {
  id: string;
  pilotId: string;
  qualificationDefinitionId: string;
  status: TrainingApplicationStatus;
  eligibilitySnapshot: QualificationEligibility;
  appliedAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  paymentTransactionId: string | null;
  assignedInstructor: string | null;
  staffNote: string | null;
  checkFlightPirepId: string | null;
  checkFlightOutcome: "passed" | "failed" | "retry" | null;
  checkFlightReviewedBy: string | null;
  checkFlightReviewedAt: string | null;
  modules: TrainingModuleProgress[];
};

export type TrainingModuleProgress = {
  id: string;
  moduleId: string;
  completedAt: string | null;
  completedBy: string | null;
};

export type QualificationRequirementCheck = {
  key: "available" | "rank" | "hours" | "sectors" | "balance" | "prerequisite" | "type_rating" | "already_held";
  label: string;
  met: boolean;
  detail: string;
};

export type QualificationEligibility = {
  eligible: boolean;
  checks: QualificationRequirementCheck[];
};

export type AircraftCareerEligibility = {
  eligible: boolean;
  role: "first_officer" | "captain";
  requiredRating: string | null;
  reasons: string[];
};

export type CareerDashboard = {
  economy: CareerEconomySettings;
  finance: PilotFinanceAccount;
  qualifications: PilotQualification[];
  applications: TrainingApplication[];
  definitions: CareerQualificationDefinition[];
  transactions: PilotFinanceTransaction[];
};

type CareerAudit = { id: string; pilotId: string; trainingApplicationId: string | null; qualificationId: string | null; action: string; oldValue: unknown; newValue: unknown; reason: string | null; staffMember: string | null; createdAt: string };
type ConfigurationAudit = { id: string; entityId: string; action: string; oldValue: unknown; newValue: unknown; reason: string | null; staffMember: string; createdAt: string };
type LocalCareerState = { accounts: PilotFinanceAccount[]; transactions: PilotFinanceTransaction[]; qualifications: PilotQualification[]; applications: Omit<TrainingApplication, "modules">[]; modules: Array<TrainingModuleProgress & { applicationId: string }>; audits: CareerAudit[]; configurationAudits: ConfigurationAudit[]; economy: CareerEconomySettings; definitions: CareerQualificationDefinition[] };

function careerClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

function localFallbackAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.BAV_PILOT_LOCAL_FALLBACK === "1";
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function finiteMoney(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? roundMoney(amount) : 0;
}

function validStatus(value: unknown): value is QualificationStatus {
  return value === "valid" || value === "expiring_soon" || value === "recurrent_due" || value === "expired" || value === "suspended";
}

function validApplicationStatus(value: unknown): value is TrainingApplicationStatus {
  return typeof value === "string" && ["not_eligible", "eligible", "application_submitted", "awaiting_approval", "approved", "payment_pending", "training_assigned", "training_in_progress", "check_flight_required", "check_flight_submitted", "check_flight_review", "passed", "failed", "type_rating_issued", "expired", "suspended"].includes(value);
}

function validSource(value: unknown): value is QualificationSource {
  return value === "training" || value === "grandfathered" || value === "manual";
}

function normaliseRequirements(value: unknown): QualificationRequirements {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rank = typeof raw.minimumRank === "string" && (PILOT_RANKS as readonly string[]).includes(raw.minimumRank) ? raw.minimumRank as PilotRank : undefined;
  const number = (key: "minimumHours" | "minimumSectors") => Number.isFinite(Number(raw[key])) ? Math.max(0, Number(raw[key])) : undefined;
  return { minimumRank: rank, minimumHours: number("minimumHours"), minimumSectors: number("minimumSectors"), prerequisite: typeof raw.prerequisite === "string" ? raw.prerequisite : undefined, requiresValidTypeRating: raw.requiresValidTypeRating === true };
}

function normaliseEconomy(value: unknown): CareerEconomySettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rankRates = raw.rankHourlyRates && typeof raw.rankHourlyRates === "object" ? raw.rankHourlyRates as Record<string, unknown> : {};
  const multipliers = raw.aircraftMultipliers && typeof raw.aircraftMultipliers === "object" ? raw.aircraftMultipliers as Record<string, unknown> : {};
  const number = (key: keyof Omit<CareerEconomySettings, "currency" | "label" | "rankHourlyRates" | "aircraftMultipliers">, fallback: number, min: number, max: number) => {
    const value = Number(raw[key]);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  return {
    currency: "GBP",
    label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim().slice(0, 100) : DEFAULT_CAREER_ECONOMY.label,
    rankHourlyRates: Object.fromEntries(PILOT_RANKS.map((rank) => {
      const configured = Number(rankRates[rank]);
      return [rank, Number.isFinite(configured) ? Math.min(1000, Math.max(0, roundMoney(configured))) : DEFAULT_CAREER_ECONOMY.rankHourlyRates[rank]];
    })) as CareerEconomySettings["rankHourlyRates"],
    aircraftMultipliers: Object.fromEntries(Object.entries(DEFAULT_CAREER_ECONOMY.aircraftMultipliers).map(([key, fallback]) => [key, Math.min(3, Math.max(0.1, Number(multipliers[key]) || fallback))])) as CareerEconomySettings["aircraftMultipliers"],
    sectorAllowance: number("sectorAllowance", DEFAULT_CAREER_ECONOMY.sectorAllowance, 0, 2000),
    longHaulAllowance: number("longHaulAllowance", DEFAULT_CAREER_ECONOMY.longHaulAllowance, 0, 5000),
    commandBonus: number("commandBonus", DEFAULT_CAREER_ECONOMY.commandBonus, 0, 5000),
    instructorBonus: number("instructorBonus", DEFAULT_CAREER_ECONOMY.instructorBonus, 0, 5000),
    longHaulThresholdMinutes: number("longHaulThresholdMinutes", DEFAULT_CAREER_ECONOMY.longHaulThresholdMinutes, 60, 1200),
  };
}

function definitionFromRow(row: Record<string, unknown>): CareerQualificationDefinition {
  const id = String(row.id ?? "").trim();
  const fallback = DEFAULT_QUALIFICATION_DEFINITIONS.find((definition) => definition.id === id);
  return {
    id,
    kind: row.kind === "command" || row.kind === "instructor" ? row.kind : "type_rating",
    name: typeof row.name === "string" ? row.name : fallback?.name ?? id,
    aircraftFamily: typeof row.aircraft_family === "string" ? row.aircraft_family : fallback?.aircraftFamily ?? null,
    variants: Array.isArray(row.variants) ? row.variants.filter((item): item is string => typeof item === "string") : fallback?.variants ?? [],
    description: typeof row.description === "string" ? row.description : fallback?.description ?? "Virtual qualification.",
    virtualTrainingCost: finiteMoney(row.virtual_training_cost ?? fallback?.virtualTrainingCost),
    recurrentTrainingCost: finiteMoney(row.recurrent_training_cost ?? fallback?.recurrentTrainingCost),
    requirements: normaliseRequirements(row.requirements ?? fallback?.requirements),
    trainingModules: Array.isArray(row.training_modules) ? row.training_modules.filter((item): item is string => typeof item === "string") : fallback?.trainingModules ?? [],
    checkFlightRequired: row.check_flight_required === true || fallback?.checkFlightRequired === true,
    staffApprovalRequired: row.staff_approval_required !== false,
    validityMonths: Number.isFinite(Number(row.validity_months)) ? Number(row.validity_months) : fallback?.validityMonths ?? null,
    recurrentIntervalMonths: Number.isFinite(Number(row.recurrent_interval_months)) ? Number(row.recurrent_interval_months) : fallback?.recurrentIntervalMonths ?? null,
    available: row.available !== false,
    displayOrder: Number.isFinite(Number(row.display_order)) ? Number(row.display_order) : fallback?.displayOrder ?? 0,
  };
}

function copyDefinitions(definitions = DEFAULT_QUALIFICATION_DEFINITIONS) {
  return definitions.map((definition) => ({ ...definition, variants: [...definition.variants], requirements: { ...definition.requirements }, trainingModules: [...definition.trainingModules] }));
}

function applyScaledMarketTrainingBaseline(definitions: readonly CareerQualificationDefinition[]) {
  return definitions.map((definition) => {
    const legacy = LEGACY_DEFAULT_TRAINING_COSTS[definition.id];
    const previousScaled = PREVIOUS_SCALED_TRAINING_COSTS[definition.id];
    const previousMarket = PREVIOUS_MARKET_TRAINING_COSTS[definition.id];
    const benchmark = DEFAULT_QUALIFICATION_DEFINITIONS.find((item) => item.id === definition.id);
    const isLegacyDefault = legacy && definition.virtualTrainingCost === legacy.training && definition.recurrentTrainingCost === legacy.recurrent;
    const isPreviousScaledDefault = previousScaled && definition.virtualTrainingCost === previousScaled.training && definition.recurrentTrainingCost === previousScaled.recurrent;
    const isPreviousMarketDefault = previousMarket && definition.virtualTrainingCost === previousMarket.training && definition.recurrentTrainingCost === previousMarket.recurrent;
    if (!benchmark || (!isLegacyDefault && !isPreviousScaledDefault && !isPreviousMarketDefault)) return definition;
    if (definition.virtualTrainingCost === benchmark.virtualTrainingCost && definition.recurrentTrainingCost === benchmark.recurrentTrainingCost) return definition;
    return { ...definition, virtualTrainingCost: benchmark.virtualTrainingCost, recurrentTrainingCost: benchmark.recurrentTrainingCost };
  });
}

function normaliseDefinition(value: unknown, fallback: CareerQualificationDefinition): CareerQualificationDefinition {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const readString = (key: string, fallbackValue: string, max = 500) => typeof raw[key] === "string" && raw[key].trim() ? raw[key].trim().slice(0, max) : fallbackValue;
  const readMoney = (key: string, fallbackValue: number) => {
    const amount = Number(raw[key]);
    return Number.isFinite(amount) ? Math.min(100_000, Math.max(0, roundMoney(amount))) : fallbackValue;
  };
  const readMonths = (key: string, fallbackValue: number | null) => {
    if (raw[key] === "" || raw[key] === null) return null;
    const months = Number(raw[key]);
    return Number.isInteger(months) && months >= 1 && months <= 120 ? months : fallbackValue;
  };
  const readBoolean = (key: string, fallbackValue: boolean) => raw[key] === true || raw[key] === "true" ? true : raw[key] === false || raw[key] === "false" ? false : fallbackValue;
  const split = (key: string, fallbackValue: string[]) => Array.isArray(raw[key])
    ? raw[key].filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20)
    : typeof raw[key] === "string" ? raw[key].split(/[\n,]/).map((item) => item.trim()).filter(Boolean).slice(0, 20) : fallbackValue;
  const requirements = normaliseRequirements(raw.requirements ?? {
    minimumRank: raw.minimumRank,
    minimumHours: raw.minimumHours,
    minimumSectors: raw.minimumSectors,
    prerequisite: raw.prerequisite,
    requiresValidTypeRating: raw.requiresValidTypeRating,
  });
  const displayOrder = Number(raw.displayOrder);
  return {
    id: fallback.id,
    kind: fallback.kind,
    name: readString("name", fallback.name, 120),
    aircraftFamily: fallback.aircraftFamily,
    variants: split("variants", fallback.variants),
    description: readString("description", fallback.description, 1000),
    virtualTrainingCost: readMoney("virtualTrainingCost", fallback.virtualTrainingCost),
    recurrentTrainingCost: readMoney("recurrentTrainingCost", fallback.recurrentTrainingCost),
    requirements,
    trainingModules: split("trainingModules", fallback.trainingModules),
    checkFlightRequired: readBoolean("checkFlightRequired", fallback.checkFlightRequired),
    staffApprovalRequired: readBoolean("staffApprovalRequired", fallback.staffApprovalRequired),
    validityMonths: readMonths("validityMonths", fallback.validityMonths),
    recurrentIntervalMonths: readMonths("recurrentIntervalMonths", fallback.recurrentIntervalMonths),
    available: readBoolean("available", fallback.available),
    displayOrder: Number.isInteger(displayOrder) ? Math.min(9999, Math.max(0, displayOrder)) : fallback.displayOrder,
  };
}

function accountFromRow(row: Record<string, unknown>, pilotId?: string): PilotFinanceAccount {
  return { pilotId: String(row.pilot_id ?? pilotId ?? ""), currency: "GBP", currentBalance: finiteMoney(row.current_balance), lifetimeEarnings: finiteMoney(row.lifetime_earnings), currentMonthEarnings: finiteMoney(row.current_month_earnings), previousMonthEarnings: finiteMoney(row.previous_month_earnings), updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString() };
}

function transactionFromRow(row: Record<string, unknown>): PilotFinanceTransaction {
  return { id: String(row.id), pilotId: String(row.pilot_id), idempotencyKey: String(row.idempotency_key), category: row.category as FinanceTransactionCategory, amount: finiteMoney(row.amount), balanceBefore: finiteMoney(row.balance_before), balanceAfter: finiteMoney(row.balance_after), relatedPirepId: typeof row.related_pirep_id === "string" ? row.related_pirep_id : null, relatedTrainingApplicationId: typeof row.related_training_application_id === "string" ? row.related_training_application_id : null, relatedQualificationId: typeof row.related_qualification_id === "string" ? row.related_qualification_id : null, reversedTransactionId: typeof row.reversed_transaction_id === "string" ? row.reversed_transaction_id : null, description: String(row.description ?? "Virtual account transaction"), createdAutomatically: row.created_automatically !== false, staffMember: typeof row.staff_member === "string" ? row.staff_member : null, createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString() };
}

function qualificationFromRow(row: Record<string, unknown>): PilotQualification {
  return { id: String(row.id), pilotId: String(row.pilot_id), qualificationDefinitionId: String(row.qualification_definition_id), status: validStatus(row.status) ? row.status : "expired", source: validSource(row.source) ? row.source : "manual", issuedAt: typeof row.issued_at === "string" ? row.issued_at : new Date().toISOString(), issuedBy: typeof row.issued_by === "string" ? row.issued_by : null, trainingApplicationId: typeof row.training_application_id === "string" ? row.training_application_id : null, checkFlightPirepId: typeof row.check_flight_pirep_id === "string" ? row.check_flight_pirep_id : null, validFrom: typeof row.valid_from === "string" ? row.valid_from : new Date().toISOString(), validUntil: typeof row.valid_until === "string" ? row.valid_until : null, lastRecurrentAt: typeof row.last_recurrent_at === "string" ? row.last_recurrent_at : null, nextRecurrentAt: typeof row.next_recurrent_at === "string" ? row.next_recurrent_at : null, staffNote: typeof row.staff_note === "string" ? row.staff_note : null };
}

function localEmptyState(): LocalCareerState {
  return { accounts: [], transactions: [], qualifications: [], applications: [], modules: [], audits: [], configurationAudits: [], definitions: copyDefinitions(), economy: { ...DEFAULT_CAREER_ECONOMY, rankHourlyRates: { ...DEFAULT_CAREER_ECONOMY.rankHourlyRates }, aircraftMultipliers: { ...DEFAULT_CAREER_ECONOMY.aircraftMultipliers } } };
}

async function readLocalState(): Promise<LocalCareerState> {
  try {
    const parsed = JSON.parse(await fs.readFile(LOCAL_FILE, "utf8")) as Partial<LocalCareerState>;
    const defaults = localEmptyState();
    const definitions = Array.isArray(parsed.definitions) && parsed.definitions.length
      ? parsed.definitions.map((definition) => {
        const id = definition && typeof definition === "object" ? String((definition as Record<string, unknown>).id ?? "") : "";
        const fallback = DEFAULT_QUALIFICATION_DEFINITIONS.find((item) => item.id === id);
        return fallback ? normaliseDefinition(definition, fallback) : null;
      }).filter((definition): definition is CareerQualificationDefinition => Boolean(definition))
      : defaults.definitions;
    return { ...defaults, ...parsed, definitions, configurationAudits: Array.isArray(parsed.configurationAudits) ? parsed.configurationAudits : [], economy: normaliseEconomy(parsed.economy) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return localEmptyState();
    throw error;
  }
}

async function writeLocalState(state: LocalCareerState) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporary = `${LOCAL_FILE}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(temporary, LOCAL_FILE);
}

function applyQualificationStatus(qualification: PilotQualification, now = Date.now()): PilotQualification {
  if (qualification.status === "suspended" || qualification.status === "expired") return qualification;
  const until = qualification.validUntil ? Date.parse(qualification.validUntil) : NaN;
  if (Number.isFinite(until) && until <= now) return { ...qualification, status: "expired" };
  const recurrent = qualification.nextRecurrentAt ? Date.parse(qualification.nextRecurrentAt) : NaN;
  if (Number.isFinite(recurrent) && recurrent <= now) return { ...qualification, status: "recurrent_due" };
  if (Number.isFinite(until) && until - now <= 30 * 86_400_000) return { ...qualification, status: "expiring_soon" };
  return qualification;
}

function rankAtLeast(current: PilotRank, target: PilotRank) {
  return PILOT_RANKS.indexOf(current) >= PILOT_RANKS.indexOf(target);
}

function addMonths(date: Date, months: number | null) {
  if (!months) return null;
  const value = new Date(date);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString();
}

function applicationFromRow(row: Record<string, unknown>, modules: TrainingModuleProgress[]): TrainingApplication {
  return { id: String(row.id), pilotId: String(row.pilot_id), qualificationDefinitionId: String(row.qualification_definition_id), status: validApplicationStatus(row.status) ? row.status : "application_submitted", eligibilitySnapshot: row.eligibility_snapshot && typeof row.eligibility_snapshot === "object" ? row.eligibility_snapshot as QualificationEligibility : { eligible: false, checks: [] }, appliedAt: typeof row.applied_at === "string" ? row.applied_at : new Date().toISOString(), updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(), approvedAt: typeof row.approved_at === "string" ? row.approved_at : null, approvedBy: typeof row.approved_by === "string" ? row.approved_by : null, paymentTransactionId: typeof row.payment_transaction_id === "string" ? row.payment_transaction_id : null, assignedInstructor: typeof row.assigned_instructor === "string" ? row.assigned_instructor : null, staffNote: typeof row.staff_note === "string" ? row.staff_note : null, checkFlightPirepId: typeof row.check_flight_pirep_id === "string" ? row.check_flight_pirep_id : null, checkFlightOutcome: row.check_flight_outcome === "passed" || row.check_flight_outcome === "failed" || row.check_flight_outcome === "retry" ? row.check_flight_outcome : null, checkFlightReviewedBy: typeof row.check_flight_reviewed_by === "string" ? row.check_flight_reviewed_by : null, checkFlightReviewedAt: typeof row.check_flight_reviewed_at === "string" ? row.check_flight_reviewed_at : null, modules };
}

function moduleFromRow(row: Record<string, unknown>): TrainingModuleProgress {
  return { id: String(row.id), moduleId: String(row.module_id), completedAt: typeof row.completed_at === "string" ? row.completed_at : null, completedBy: typeof row.completed_by === "string" ? row.completed_by : null };
}

function clientOrThrow() {
  const client = careerClient();
  if (client) return client;
  if (!localFallbackAllowed()) throw new Error("Pilot career storage is not configured. Apply the career migration and configure the Supabase service key.");
  return null;
}

export async function getCareerEconomySettings(): Promise<CareerEconomySettings> {
  const client = clientOrThrow();
  if (!client) return (await readLocalState()).economy;
  const { data, error } = await client.from("career_economy_settings").select("settings").eq("singleton", true).maybeSingle();
  if (error) throw error;
  return normaliseEconomy(data?.settings);
}

export async function updateCareerEconomySettings(settings: unknown, staffMember: string) {
  const normalised = normaliseEconomy(settings);
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    state.economy = normalised;
    await writeLocalState(state);
    return normalised;
  }
  const { error } = await client.from("career_economy_settings").upsert({ singleton: true, settings: normalised, updated_at: new Date().toISOString(), updated_by: staffMember });
  if (error) throw error;
  return normalised;
}

export async function listQualificationDefinitions(): Promise<CareerQualificationDefinition[]> {
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    const definitions = applyScaledMarketTrainingBaseline(state.definitions);
    if (definitions.some((definition, index) => definition !== state.definitions[index])) {
      state.definitions = definitions;
      await writeLocalState(state);
    }
    return copyDefinitions(definitions);
  }
  const { data, error } = await client.from("qualification_definitions").select("*").order("display_order");
  if (error) throw error;
  let definitions = (data ?? []).map((row) => definitionFromRow(row as Record<string, unknown>));
  const revised = applyScaledMarketTrainingBaseline(definitions);
  const changed = revised.filter((definition, index) => definition !== definitions[index]);
  if (changed.length) {
    const updatedAt = new Date().toISOString();
    for (const definition of changed) {
      const { error: updateError } = await client.from("qualification_definitions").update({
        virtual_training_cost: definition.virtualTrainingCost,
        recurrent_training_cost: definition.recurrentTrainingCost,
        updated_at: updatedAt,
      }).eq("id", definition.id);
      if (updateError) throw updateError;
    }
    definitions = revised;
  }
  return definitions;
}

async function auditConfiguration(input: Omit<ConfigurationAudit, "id" | "createdAt">) {
  const entry: ConfigurationAudit = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    state.configurationAudits.push(entry);
    await writeLocalState(state);
    return;
  }
  const { error } = await client.from("career_configuration_audit_log").insert({ id: entry.id, entity_id: entry.entityId, action: entry.action, old_value: entry.oldValue, new_value: entry.newValue, reason: entry.reason, staff_member: entry.staffMember, created_at: entry.createdAt });
  if (error) throw error;
}

export async function updateQualificationDefinition(definitionId: string, patch: unknown, staffMember: string) {
  const current = (await listQualificationDefinitions()).find((definition) => definition.id === definitionId);
  if (!current) throw new Error("Qualification programme not found.");
  const next = normaliseDefinition(patch, current);
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    state.definitions = state.definitions.map((definition) => definition.id === definitionId ? next : definition);
    await writeLocalState(state);
  } else {
    const { error } = await client.from("qualification_definitions").update({
      name: next.name, variants: next.variants, description: next.description,
      virtual_training_cost: next.virtualTrainingCost, recurrent_training_cost: next.recurrentTrainingCost,
      requirements: next.requirements, training_modules: next.trainingModules,
      check_flight_required: next.checkFlightRequired, staff_approval_required: next.staffApprovalRequired,
      validity_months: next.validityMonths, recurrent_interval_months: next.recurrentIntervalMonths,
      available: next.available, display_order: next.displayOrder, updated_at: new Date().toISOString(),
    }).eq("id", definitionId);
    if (error) throw error;
  }
  await auditConfiguration({ entityId: definitionId, action: "qualification_definition_updated", oldValue: current, newValue: next, reason: null, staffMember });
  return next;
}

export async function getPilotFinanceAccount(pilotId: string): Promise<PilotFinanceAccount> {
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    let account = state.accounts.find((item) => item.pilotId === pilotId);
    if (!account) {
      account = { pilotId, currency: "GBP", currentBalance: 0, lifetimeEarnings: 0, currentMonthEarnings: 0, previousMonthEarnings: 0, updatedAt: new Date().toISOString() };
      state.accounts.push(account);
      await writeLocalState(state);
    }
    return account;
  }
  const { error: upsertError } = await client.from("pilot_finance_accounts").upsert({ pilot_id: pilotId }, { onConflict: "pilot_id", ignoreDuplicates: true });
  if (upsertError) throw upsertError;
  const { data, error } = await client.from("pilot_finance_accounts").select("*").eq("pilot_id", pilotId).single();
  if (error) throw error;
  const account = accountFromRow(data as Record<string, unknown>, pilotId);
  // Account totals are derived from the immutable ledger rather than relying
  // on a rollover job or a stale account summary. This also repairs any
  // historical entry created while the finance RPC was unavailable.
  const now = new Date();
  const { data: ledgerRows, error: ledgerError } = await client.from("pilot_finance_transactions").select("amount,created_at").eq("pilot_id", pilotId).limit(10_000);
  if (ledgerError) throw ledgerError;
  account.currentBalance = 0;
  account.lifetimeEarnings = 0;
  account.currentMonthEarnings = 0;
  account.previousMonthEarnings = 0;
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  for (const row of ledgerRows ?? []) {
    const amount = finiteMoney((row as Record<string, unknown>).amount);
    account.currentBalance = roundMoney(account.currentBalance + amount);
    if (amount > 0) account.lifetimeEarnings = roundMoney(account.lifetimeEarnings + amount);
    if (amount <= 0) continue;
    const createdAt = Date.parse(String((row as Record<string, unknown>).created_at ?? ""));
    if (createdAt >= thisMonth.getTime()) account.currentMonthEarnings = roundMoney(account.currentMonthEarnings + amount);
    else account.previousMonthEarnings = roundMoney(account.previousMonthEarnings + amount);
  }
  const stored = accountFromRow(data as Record<string, unknown>, pilotId);
  if (stored.currentBalance !== account.currentBalance || stored.lifetimeEarnings !== account.lifetimeEarnings || stored.currentMonthEarnings !== account.currentMonthEarnings || stored.previousMonthEarnings !== account.previousMonthEarnings) {
    account.updatedAt = now.toISOString();
    const { error: syncError } = await client.from("pilot_finance_accounts").update({
      current_balance: account.currentBalance,
      lifetime_earnings: account.lifetimeEarnings,
      current_month_earnings: account.currentMonthEarnings,
      previous_month_earnings: account.previousMonthEarnings,
      updated_at: account.updatedAt,
    }).eq("pilot_id", pilotId);
    if (syncError) throw syncError;
  }
  return account;
}

export async function listPilotFinanceTransactions(pilotId: string, limit = 40): Promise<PilotFinanceTransaction[]> {
  const client = clientOrThrow();
  if (!client) return (await readLocalState()).transactions.filter((item) => item.pilotId === pilotId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  const { data, error } = await client.from("pilot_finance_transactions").select("*").eq("pilot_id", pilotId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => transactionFromRow(row as Record<string, unknown>));
}

export async function listPilotQualifications(pilotId: string): Promise<PilotQualification[]> {
  const client = clientOrThrow();
  if (!client) return (await readLocalState()).qualifications.filter((item) => item.pilotId === pilotId).map((item) => applyQualificationStatus(item)).sort((a, b) => a.qualificationDefinitionId.localeCompare(b.qualificationDefinitionId));
  const { data, error } = await client.from("pilot_qualifications").select("*").eq("pilot_id", pilotId).order("issued_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => applyQualificationStatus(qualificationFromRow(row as Record<string, unknown>)));
}

export async function listPilotQualificationsForStaff(limit = 500): Promise<PilotQualification[]> {
  const client = clientOrThrow();
  if (!client) return (await readLocalState()).qualifications.map((item) => applyQualificationStatus(item)).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).slice(0, limit);
  const { data, error } = await client.from("pilot_qualifications").select("*").order("updated_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => applyQualificationStatus(qualificationFromRow(row as Record<string, unknown>)));
}

export async function listPilotTrainingApplications(pilotId: string): Promise<TrainingApplication[]> {
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    return state.applications.filter((item) => item.pilotId === pilotId).map((item) => ({ ...item, modules: state.modules.filter((module) => module.applicationId === item.id).map((module) => ({ id: module.id, moduleId: module.moduleId, completedAt: module.completedAt, completedBy: module.completedBy })) })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const { data, error } = await client.from("training_applications").select("*").eq("pilot_id", pilotId).order("updated_at", { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const ids = rows.map((row) => String((row as Record<string, unknown>).id));
  const { data: moduleRows, error: moduleError } = ids.length ? await client.from("pilot_training_module_progress").select("*").in("training_application_id", ids) : { data: [], error: null };
  if (moduleError) throw moduleError;
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    const id = String(record.id);
    return applicationFromRow(record, (moduleRows ?? []).filter((module) => String((module as Record<string, unknown>).training_application_id) === id).map((module) => moduleFromRow(module as Record<string, unknown>)));
  });
}

export async function listTrainingApplicationsForStaff(limit = 200): Promise<TrainingApplication[]> {
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    return state.applications.map((item) => ({ ...item, modules: state.modules.filter((module) => module.applicationId === item.id).map((module) => ({ id: module.id, moduleId: module.moduleId, completedAt: module.completedAt, completedBy: module.completedBy })) })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
  }
  const { data, error } = await client.from("training_applications").select("*").order("updated_at", { ascending: false }).limit(limit);
  if (error) throw error;
  const rows = data ?? [];
  const ids = rows.map((row) => String((row as Record<string, unknown>).id));
  const { data: moduleRows, error: moduleError } = ids.length ? await client.from("pilot_training_module_progress").select("*").in("training_application_id", ids) : { data: [], error: null };
  if (moduleError) throw moduleError;
  return rows.map((row) => {
    const record = row as Record<string, unknown>;
    const id = String(record.id);
    return applicationFromRow(record, (moduleRows ?? []).filter((module) => String((module as Record<string, unknown>).training_application_id) === id).map((module) => moduleFromRow(module as Record<string, unknown>)));
  });
}

function legacyGrandfatheredQualifications(pilot: PilotAccount): PilotQualification[] {
  const map: Record<string, string> = { a350: "A350", b777: "B777", b787: "B787" };
  return pilot.typeRatings.map((rating) => map[rating]).filter((id): id is string => Boolean(id)).map((id) => ({ id: `legacy-${pilot.id}-${id}`, pilotId: pilot.id, qualificationDefinitionId: id, status: "valid", source: "grandfathered", issuedAt: pilot.createdAt, issuedBy: "BAV migration", trainingApplicationId: null, checkFlightPirepId: null, validFrom: pilot.createdAt, validUntil: null, lastRecurrentAt: null, nextRecurrentAt: null, staffNote: "Grandfathered from an existing BAV type-rating record." }));
}

function activeQualificationIds(pilot: PilotAccount, qualifications: readonly PilotQualification[]) {
  return new Set([...qualifications, ...legacyGrandfatheredQualifications(pilot)].map(applyQualificationStatus).filter((item) => item.status === "valid" || item.status === "expiring_soon").map((item) => item.qualificationDefinitionId));
}

export async function checkQualificationEligibility(pilot: PilotAccount, definition: CareerQualificationDefinition): Promise<QualificationEligibility> {
  const [account, qualifications] = await Promise.all([getPilotFinanceAccount(pilot.id), listPilotQualifications(pilot.id)]);
  const requirements = definition.requirements;
  const active = activeQualificationIds(pilot, qualifications);
  const checks: QualificationRequirementCheck[] = [
    { key: "available", label: "Training availability", met: definition.available, detail: definition.available ? "Training programme is currently open." : "Training programme is currently unavailable." },
    { key: "rank", label: "Rank requirement", met: !requirements.minimumRank || rankAtLeast(pilot.rank, requirements.minimumRank), detail: requirements.minimumRank ? `${pilot.rank} / ${requirements.minimumRank}` : "No minimum rank." },
    { key: "hours", label: "VA flight hours", met: !requirements.minimumHours || pilot.hours >= requirements.minimumHours, detail: `${pilot.hours.toFixed(1)} / ${(requirements.minimumHours ?? 0).toFixed(1)} hours` },
    { key: "sectors", label: "Accepted sectors", met: !requirements.minimumSectors || pilot.flights >= requirements.minimumSectors, detail: `${pilot.flights} / ${requirements.minimumSectors ?? 0} sectors` },
    { key: "balance", label: "Virtual account balance", met: account.currentBalance >= definition.virtualTrainingCost, detail: `£${account.currentBalance.toLocaleString("en-GB", { minimumFractionDigits: 2 })} / £${definition.virtualTrainingCost.toLocaleString("en-GB", { minimumFractionDigits: 2 })}` },
  ];
  if (requirements.prerequisite) checks.push({ key: "prerequisite", label: "Prerequisite qualification", met: active.has(requirements.prerequisite), detail: active.has(requirements.prerequisite) ? `${requirements.prerequisite} valid` : `${requirements.prerequisite} qualification required` });
  if (requirements.requiresValidTypeRating) checks.push({ key: "type_rating", label: "Valid type rating", met: [...active].some((id) => id !== "COMMAND"), detail: [...active].some((id) => id !== "COMMAND") ? "A valid aircraft family qualification is held." : "Obtain a valid aircraft type rating first." });
  checks.push({ key: "already_held", label: "Existing qualification", met: !active.has(definition.id), detail: active.has(definition.id) ? "Already held and valid." : "Not yet held." });
  return { eligible: checks.every((check) => check.met), checks };
}

async function audit(input: Omit<CareerAudit, "id" | "createdAt">) {
  const entry: CareerAudit = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    state.audits.push(entry);
    await writeLocalState(state);
    return;
  }
  const { error } = await client.from("qualification_audit_log").insert({ id: entry.id, pilot_id: entry.pilotId, training_application_id: entry.trainingApplicationId, qualification_id: entry.qualificationId, action: entry.action, old_value: entry.oldValue, new_value: entry.newValue, reason: entry.reason, staff_member: entry.staffMember, created_at: entry.createdAt });
  if (error) throw error;
}

export async function applyForTypeRating(pilot: PilotAccount, definitionId: string) {
  const definitions = await listQualificationDefinitions();
  const definition = definitions.find((item) => item.id === definitionId && item.kind !== "instructor");
  if (!definition) throw new Error("Qualification programme not found.");
  const eligibility = await checkQualificationEligibility(pilot, definition);
  if (!eligibility.eligible) throw new Error("You are not currently eligible for this training programme.");
  const existing = await listPilotTrainingApplications(pilot.id);
  if (existing.some((item) => item.qualificationDefinitionId === definitionId && !["failed", "type_rating_issued", "expired", "suspended"].includes(item.status))) throw new Error("You already have an active application for this qualification.");
  const now = new Date().toISOString();
  const record = { id: randomUUID(), pilotId: pilot.id, qualificationDefinitionId: definitionId, status: definition.staffApprovalRequired ? "awaiting_approval" as const : "approved" as const, eligibilitySnapshot: eligibility, appliedAt: now, updatedAt: now, approvedAt: null, approvedBy: null, paymentTransactionId: null, assignedInstructor: null, staffNote: null, checkFlightPirepId: null, checkFlightOutcome: null, checkFlightReviewedBy: null, checkFlightReviewedAt: null, modules: [] as TrainingModuleProgress[] };
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    state.applications.push(record);
    await writeLocalState(state);
  } else {
    const { error } = await client.from("training_applications").insert({ id: record.id, pilot_id: record.pilotId, qualification_definition_id: record.qualificationDefinitionId, status: record.status, eligibility_snapshot: eligibility, applied_at: now, updated_at: now });
    if (error) throw error;
  }
  await audit({ pilotId: pilot.id, trainingApplicationId: record.id, qualificationId: null, action: "application_submitted", oldValue: null, newValue: { definitionId, eligibility }, reason: null, staffMember: null });
  return record;
}

async function getApplication(applicationId: string): Promise<TrainingApplication | null> {
  const applications = await listTrainingApplicationsForStaff(500);
  return applications.find((item) => item.id === applicationId) ?? null;
}

export async function approveTrainingApplication(applicationId: string, staffMember: string, note?: string, instructor?: string) {
  const application = await getApplication(applicationId);
  if (!application) throw new Error("Training application not found.");
  if (application.status !== "awaiting_approval" && application.status !== "application_submitted") throw new Error("Only a submitted training application can be approved.");
  const now = new Date().toISOString();
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    const current = state.applications.find((item) => item.id === applicationId)!;
    current.status = "approved";
    current.approvedAt = now;
    current.approvedBy = staffMember;
    current.assignedInstructor = instructor?.trim() || null;
    current.staffNote = note?.trim().slice(0, 2000) || null;
    current.updatedAt = now;
    await writeLocalState(state);
  } else {
    const { error } = await client.from("training_applications").update({ status: "approved", approved_at: now, approved_by: staffMember, assigned_instructor: instructor?.trim() || null, staff_note: note?.trim().slice(0, 2000) || null, updated_at: now }).eq("id", applicationId);
    if (error) throw error;
  }
  await audit({ pilotId: application.pilotId, trainingApplicationId: applicationId, qualificationId: null, action: "application_approved", oldValue: { status: application.status }, newValue: { status: "approved", instructor: instructor?.trim() || null }, reason: note?.trim() || null, staffMember });
}

type FinanceTransactionInput = { pilotId: string; idempotencyKey: string; category: FinanceTransactionCategory; amount: number; description: string; relatedPirepId?: string | null; relatedTrainingApplicationId?: string | null; relatedQualificationId?: string | null; reversedTransactionId?: string | null; createdAutomatically: boolean; staffMember?: string | null; };

/**
 * Rebuild the account summary from the immutable ledger. This is used by the
 * table-level posting fallback below, and also repairs a historical partial
 * write where a transaction was created but its account summary was not.
 */
async function synchronisePilotFinanceAccount(client: SupabaseClient, pilotId: string) {
  const { data, error } = await client.from("pilot_finance_transactions").select("amount,created_at").eq("pilot_id", pilotId).limit(10_000);
  if (error) throw error;
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
  const previousMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).getTime();
  let currentBalance = 0;
  let lifetimeEarnings = 0;
  let currentMonthEarnings = 0;
  let previousMonthEarnings = 0;
  for (const row of data ?? []) {
    const entry = row as Record<string, unknown>;
    const amount = finiteMoney(entry.amount);
    currentBalance = roundMoney(currentBalance + amount);
    if (amount <= 0) continue;
    lifetimeEarnings = roundMoney(lifetimeEarnings + amount);
    const createdAt = Date.parse(String(entry.created_at ?? ""));
    if (createdAt >= currentMonthStart) currentMonthEarnings = roundMoney(currentMonthEarnings + amount);
    else if (createdAt >= previousMonthStart) previousMonthEarnings = roundMoney(previousMonthEarnings + amount);
  }
  const { error: accountError } = await client.from("pilot_finance_accounts").upsert({
    pilot_id: pilotId,
    current_balance: currentBalance,
    lifetime_earnings: lifetimeEarnings,
    current_month_earnings: currentMonthEarnings,
    previous_month_earnings: previousMonthEarnings,
    updated_at: now.toISOString(),
  }, { onConflict: "pilot_id" });
  if (accountError) throw accountError;
}

/**
 * The normal route is the atomic Postgres function. Some already-running
 * Supabase projects can temporarily lack that function in the PostgREST
 * schema cache even though the ledger tables are present. This fallback keeps
 * posting durable and idempotent rather than leaving accepted PIREPs unpaid.
 */
async function postFinanceTransactionViaTables(client: SupabaseClient, input: FinanceTransactionInput, amount: number) {
  const existingResult = await client.from("pilot_finance_transactions").select("*").eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (existingResult.error) throw existingResult.error;
  if (existingResult.data) {
    await synchronisePilotFinanceAccount(client, input.pilotId);
    return { transaction: transactionFromRow(existingResult.data as Record<string, unknown>), posted: false };
  }

  const { error: ensureAccountError } = await client.from("pilot_finance_accounts").upsert({ pilot_id: input.pilotId }, { onConflict: "pilot_id", ignoreDuplicates: true });
  if (ensureAccountError) throw ensureAccountError;
  const { data: accountRow, error: accountReadError } = await client.from("pilot_finance_accounts").select("current_balance").eq("pilot_id", input.pilotId).single();
  if (accountReadError) throw accountReadError;
  const balanceBefore = finiteMoney((accountRow as Record<string, unknown>).current_balance);
  const balanceAfter = roundMoney(balanceBefore + amount);
  if (balanceAfter < 0) throw new Error("Insufficient virtual account balance.");

  const createdAt = new Date().toISOString();
  const { data, error } = await client.from("pilot_finance_transactions").insert({
    id: randomUUID(),
    pilot_id: input.pilotId,
    idempotency_key: input.idempotencyKey,
    category: input.category,
    amount,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    related_pirep_id: input.relatedPirepId ?? null,
    related_training_application_id: input.relatedTrainingApplicationId ?? null,
    related_qualification_id: input.relatedQualificationId ?? null,
    reversed_transaction_id: input.reversedTransactionId ?? null,
    description: input.description.trim().slice(0, 500),
    created_automatically: input.createdAutomatically,
    staff_member: input.staffMember ?? null,
    created_at: createdAt,
  }).select("*").maybeSingle();

  if (error) {
    // A simultaneous retry may have inserted this idempotency key first. Read
    // it back and treat it as a successful, already-settled ledger entry.
    if (error.code === "23505") {
      const retry = await client.from("pilot_finance_transactions").select("*").eq("idempotency_key", input.idempotencyKey).maybeSingle();
      if (retry.error || !retry.data) throw retry.error ?? error;
      await synchronisePilotFinanceAccount(client, input.pilotId);
      return { transaction: transactionFromRow(retry.data as Record<string, unknown>), posted: false };
    }
    throw error;
  }
  if (!data) throw new Error("The virtual finance ledger did not return a transaction.");
  await synchronisePilotFinanceAccount(client, input.pilotId);
  return { transaction: transactionFromRow(data as Record<string, unknown>), posted: true };
}

async function postFinanceTransaction(input: FinanceTransactionInput) {
  const amount = roundMoney(input.amount);
  if (!amount) throw new Error("A non-zero virtual finance amount is required.");
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    const previous = state.transactions.find((item) => item.idempotencyKey === input.idempotencyKey);
    if (previous) return { transaction: previous, posted: false };
    let account = state.accounts.find((item) => item.pilotId === input.pilotId);
    if (!account) {
      account = { pilotId: input.pilotId, currency: "GBP", currentBalance: 0, lifetimeEarnings: 0, currentMonthEarnings: 0, previousMonthEarnings: 0, updatedAt: new Date().toISOString() };
      state.accounts.push(account);
    }
    const after = roundMoney(account.currentBalance + amount);
    if (after < 0) throw new Error("Insufficient virtual account balance.");
    const transaction: PilotFinanceTransaction = { id: randomUUID(), pilotId: input.pilotId, idempotencyKey: input.idempotencyKey, category: input.category, amount, balanceBefore: account.currentBalance, balanceAfter: after, relatedPirepId: input.relatedPirepId ?? null, relatedTrainingApplicationId: input.relatedTrainingApplicationId ?? null, relatedQualificationId: input.relatedQualificationId ?? null, reversedTransactionId: input.reversedTransactionId ?? null, description: input.description.trim().slice(0, 500), createdAutomatically: input.createdAutomatically, staffMember: input.staffMember ?? null, createdAt: new Date().toISOString() };
    account.currentBalance = after;
    account.lifetimeEarnings = roundMoney(account.lifetimeEarnings + Math.max(0, amount));
    account.currentMonthEarnings = roundMoney(account.currentMonthEarnings + Math.max(0, amount));
    account.updatedAt = transaction.createdAt;
    state.transactions.push(transaction);
    await writeLocalState(state);
    return { transaction, posted: true };
  }
  const { data, error } = await client.rpc("bav_post_finance_transaction", {
    p_pilot_id: input.pilotId, p_idempotency_key: input.idempotencyKey, p_category: input.category,
    p_amount: amount, p_description: input.description.trim().slice(0, 500),
    p_related_pirep_id: input.relatedPirepId ?? null, p_related_training_application_id: input.relatedTrainingApplicationId ?? null,
    p_related_qualification_id: input.relatedQualificationId ?? null, p_reversed_transaction_id: input.reversedTransactionId ?? null,
    p_created_automatically: input.createdAutomatically, p_staff_member: input.staffMember ?? null,
  });
  if (error) {
    console.warn("[pilot-career] Finance RPC unavailable; using the idempotent ledger-table fallback.", { code: error.code, message: error.message });
    return postFinanceTransactionViaTables(client, input, amount);
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error("The virtual finance ledger did not return a transaction.");
  const transaction: PilotFinanceTransaction = { id: String(result.transaction_id), pilotId: input.pilotId, idempotencyKey: input.idempotencyKey, category: input.category, amount, balanceBefore: finiteMoney(result.balance_before), balanceAfter: finiteMoney(result.balance_after), relatedPirepId: input.relatedPirepId ?? null, relatedTrainingApplicationId: input.relatedTrainingApplicationId ?? null, relatedQualificationId: input.relatedQualificationId ?? null, reversedTransactionId: input.reversedTransactionId ?? null, description: input.description.trim().slice(0, 500), createdAutomatically: input.createdAutomatically, staffMember: input.staffMember ?? null, createdAt: new Date().toISOString() };
  return { transaction, posted: result.posted === true };
}

export async function listFinanceTransactionsForStaff(limit = 200): Promise<PilotFinanceTransaction[]> {
  const client = clientOrThrow();
  if (!client) return (await readLocalState()).transactions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  const { data, error } = await client.from("pilot_finance_transactions").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => transactionFromRow(row as Record<string, unknown>));
}

async function findFinanceTransaction(transactionId: string): Promise<PilotFinanceTransaction | null> {
  const client = clientOrThrow();
  if (!client) return (await readLocalState()).transactions.find((transaction) => transaction.id === transactionId) ?? null;
  const { data, error } = await client.from("pilot_finance_transactions").select("*").eq("id", transactionId).maybeSingle();
  if (error) throw error;
  return data ? transactionFromRow(data as Record<string, unknown>) : null;
}

async function hasFinanceOffset(transactionId: string): Promise<boolean> {
  const client = clientOrThrow();
  if (!client) return (await readLocalState()).transactions.some((transaction) => transaction.reversedTransactionId === transactionId);
  const { data, error } = await client.from("pilot_finance_transactions").select("id").eq("reversed_transaction_id", transactionId).limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

export async function reverseFinanceTransaction(transactionId: string, staffMember: string, reason: string) {
  const source = await findFinanceTransaction(transactionId);
  const note = reason.trim().slice(0, 350);
  if (!source) throw new Error("Finance transaction not found.");
  if (source.category === "refund" || source.category === "reversal") throw new Error("An offset transaction cannot be reversed again.");
  if (note.length < 3) throw new Error("A reason is required for a finance correction.");
  if (await hasFinanceOffset(source.id)) throw new Error("This finance transaction has already been offset.");
  const category: FinanceTransactionCategory = source.amount < 0 ? "refund" : "reversal";
  return postFinanceTransaction({
    pilotId: source.pilotId,
    idempotencyKey: `finance-offset:${source.id}`,
    category,
    amount: -source.amount,
    description: `${category === "refund" ? "Refund" : "Reversal"}: ${note}`,
    relatedPirepId: source.relatedPirepId,
    relatedTrainingApplicationId: source.relatedTrainingApplicationId,
    relatedQualificationId: source.relatedQualificationId,
    reversedTransactionId: source.id,
    createdAutomatically: false,
    staffMember,
  });
}

export async function postManualFinanceAdjustment(input: { pilotId: string; amount: number; reason: string; staffMember: string; requestId: string }) {
  const amount = roundMoney(input.amount);
  const reason = input.reason.trim().slice(0, 350);
  if (!input.pilotId || !input.requestId || !amount || Math.abs(amount) > 5000) throw new Error("Provide a valid virtual adjustment up to £5,000.");
  if (reason.length < 3) throw new Error("A reason is required for a finance adjustment.");
  return postFinanceTransaction({ pilotId: input.pilotId, idempotencyKey: `manual-adjustment:${input.requestId}`, category: "manual_adjustment", amount, description: `Manual adjustment: ${reason}`, createdAutomatically: false, staffMember: input.staffMember });
}

function recurrentCycleStartedAt(qualification: PilotQualification) {
  return qualification.lastRecurrentAt ?? qualification.validFrom;
}

async function findCurrentRecurrentPayment(qualification: PilotQualification): Promise<PilotFinanceTransaction | null> {
  const cycleStartedAt = recurrentCycleStartedAt(qualification);
  const client = clientOrThrow();
  if (!client) return (await readLocalState()).transactions.filter((transaction) => transaction.category === "recurrent_training" && transaction.relatedQualificationId === qualification.id && transaction.createdAt >= cycleStartedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const { data, error } = await client.from("pilot_finance_transactions").select("*").eq("category", "recurrent_training").eq("related_qualification_id", qualification.id).gte("created_at", cycleStartedAt).order("created_at", { ascending: false }).limit(1);
  if (error) throw error;
  return data?.[0] ? transactionFromRow(data[0] as Record<string, unknown>) : null;
}

export async function processRecurrentTrainingPayment(pilot: PilotAccount, qualificationId: string) {
  const qualification = (await listPilotQualifications(pilot.id)).find((item) => item.id === qualificationId);
  if (!qualification) throw new Error("Qualification record not found.");
  const current = applyQualificationStatus(qualification);
  if (current.status !== "recurrent_due" && current.status !== "expired") throw new Error("Recurrent training is not due for this qualification.");
  const definition = (await listQualificationDefinitions()).find((item) => item.id === current.qualificationDefinitionId);
  if (!definition || !definition.recurrentIntervalMonths) throw new Error("This qualification does not have a recurrent training cycle.");
  const existingPayment = await findCurrentRecurrentPayment(current);
  if (existingPayment) return { transaction: existingPayment, posted: false };
  const cycle = current.nextRecurrentAt ?? current.validUntil ?? current.issuedAt;
  const result = await postFinanceTransaction({ pilotId: pilot.id, idempotencyKey: `recurrent-training:${current.id}:${cycle}`, category: "recurrent_training", amount: -definition.recurrentTrainingCost, description: `${definition.name} recurrent virtual training`, relatedQualificationId: current.id, createdAutomatically: false });
  await audit({ pilotId: pilot.id, trainingApplicationId: null, qualificationId: current.id, action: "recurrent_training_payment_posted", oldValue: { status: current.status }, newValue: { transactionId: result.transaction.id }, reason: null, staffMember: null });
  return result;
}

export async function completeQualificationRecurrent(qualificationId: string, staffMember: string, note: string, checkFlightPirepId?: string | null) {
  const qualification = (await listPilotQualificationsForStaff(1000)).find((item) => item.id === qualificationId);
  if (!qualification) throw new Error("Qualification record not found.");
  const current = applyQualificationStatus(qualification);
  if (current.status !== "recurrent_due" && current.status !== "expired") throw new Error("This qualification is not due for recurrent training.");
  const definition = (await listQualificationDefinitions()).find((item) => item.id === current.qualificationDefinitionId);
  if (!definition || !definition.recurrentIntervalMonths) throw new Error("This qualification does not have a recurrent training cycle.");
  const payment = await findCurrentRecurrentPayment(current);
  if (!payment) throw new Error("The pilot must record the virtual recurrent-training payment before staff can complete it.");
  const now = new Date().toISOString();
  const staffNote = note.trim().slice(0, 2000) || null;
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    const record = state.qualifications.find((item) => item.id === qualificationId);
    if (!record) throw new Error("Qualification record not found.");
    Object.assign(record, { status: "valid", validFrom: now, validUntil: addMonths(new Date(now), definition.validityMonths), lastRecurrentAt: now, nextRecurrentAt: addMonths(new Date(now), definition.recurrentIntervalMonths), checkFlightPirepId: checkFlightPirepId ?? record.checkFlightPirepId, issuedBy: staffMember, staffNote });
    await writeLocalState(state);
  } else {
    const { error } = await client.from("pilot_qualifications").update({ status: "valid", valid_from: now, valid_until: addMonths(new Date(now), definition.validityMonths), last_recurrent_at: now, next_recurrent_at: addMonths(new Date(now), definition.recurrentIntervalMonths), check_flight_pirep_id: checkFlightPirepId ?? current.checkFlightPirepId, issued_by: staffMember, staff_note: staffNote, updated_at: now }).eq("id", qualificationId);
    if (error) throw error;
  }
  await audit({ pilotId: current.pilotId, trainingApplicationId: null, qualificationId, action: "recurrent_training_completed", oldValue: { status: current.status, paymentTransactionId: payment.id }, newValue: { status: "valid", nextRecurrentAt: addMonths(new Date(now), definition.recurrentIntervalMonths) }, reason: staffNote, staffMember });
}

export async function processTrainingPayment(pilot: PilotAccount, applicationId: string) {
  const application = (await listPilotTrainingApplications(pilot.id)).find((item) => item.id === applicationId);
  if (!application) throw new Error("Training application not found.");
  if (application.status !== "approved") throw new Error("This training programme is not approved for payment yet.");
  const definition = (await listQualificationDefinitions()).find((item) => item.id === application.qualificationDefinitionId);
  if (!definition) throw new Error("Qualification programme not found.");
  const eligibility = await checkQualificationEligibility(pilot, definition);
  if (!eligibility.eligible) throw new Error("Your eligibility changed before payment. Review the requirements and ask staff if you need help.");
  const result = await postFinanceTransaction({ pilotId: pilot.id, idempotencyKey: `training-payment:${application.id}`, category: "training_payment", amount: -definition.virtualTrainingCost, description: `${definition.name} virtual training`, relatedTrainingApplicationId: application.id, createdAutomatically: false });
  const now = new Date().toISOString();
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    const current = state.applications.find((item) => item.id === application.id)!;
    current.status = "training_in_progress";
    current.paymentTransactionId = result.transaction.id;
    current.updatedAt = now;
    for (const moduleId of definition.trainingModules) if (!state.modules.some((item) => item.applicationId === application.id && item.moduleId === moduleId)) state.modules.push({ id: randomUUID(), applicationId: application.id, moduleId, completedAt: null, completedBy: null });
    await writeLocalState(state);
  } else {
    const { error } = await client.from("training_applications").update({ status: "training_in_progress", payment_transaction_id: result.transaction.id, updated_at: now }).eq("id", application.id);
    if (error) throw error;
    const { error: moduleError } = await client.from("pilot_training_module_progress").upsert(definition.trainingModules.map((moduleId) => ({ training_application_id: application.id, module_id: moduleId })), { onConflict: "training_application_id,module_id", ignoreDuplicates: true });
    if (moduleError) throw moduleError;
  }
  await audit({ pilotId: pilot.id, trainingApplicationId: application.id, qualificationId: null, action: "training_payment_posted", oldValue: { status: application.status }, newValue: { status: "training_in_progress", transactionId: result.transaction.id }, reason: null, staffMember: null });
  return result.transaction;
}

export async function markTrainingModuleComplete(applicationId: string, moduleId: string, staffMember: string) {
  const application = await getApplication(applicationId);
  if (!application) throw new Error("Training application not found.");
  if (application.status !== "training_in_progress") throw new Error("Training modules can only be completed for active training.");
  const definition = (await listQualificationDefinitions()).find((item) => item.id === application.qualificationDefinitionId);
  if (!definition || !definition.trainingModules.includes(moduleId)) throw new Error("Training module not found.");
  const now = new Date().toISOString();
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    const progress = state.modules.find((item) => item.applicationId === applicationId && item.moduleId === moduleId);
    if (!progress) throw new Error("Training module progress not found.");
    progress.completedAt = now;
    progress.completedBy = staffMember;
    const allComplete = definition.trainingModules.every((id) => state.modules.some((item) => item.applicationId === applicationId && item.moduleId === id && item.completedAt));
    if (allComplete) {
      const record = state.applications.find((item) => item.id === applicationId)!;
      record.status = definition.checkFlightRequired ? "check_flight_required" : "passed";
      record.updatedAt = now;
    }
    await writeLocalState(state);
  } else {
    const { error } = await client.from("pilot_training_module_progress").update({ completed_at: now, completed_by: staffMember }).eq("training_application_id", applicationId).eq("module_id", moduleId);
    if (error) throw error;
    const refreshed = await getApplication(applicationId);
    if (refreshed && definition.trainingModules.every((id) => refreshed.modules.some((module) => module.moduleId === id && module.completedAt))) {
      const { error: statusError } = await client.from("training_applications").update({ status: definition.checkFlightRequired ? "check_flight_required" : "passed", updated_at: now }).eq("id", applicationId);
      if (statusError) throw statusError;
    }
  }
  await audit({ pilotId: application.pilotId, trainingApplicationId: applicationId, qualificationId: null, action: "training_module_completed", oldValue: null, newValue: { moduleId }, reason: null, staffMember });
}

export async function reviewTrainingCheck(applicationId: string, outcome: "passed" | "failed" | "retry", staffMember: string, note: string, checkFlightPirepId?: string | null) {
  const application = await getApplication(applicationId);
  if (!application) throw new Error("Training application not found.");
  if (application.status !== "check_flight_required" && application.status !== "check_flight_review") throw new Error("This training programme is not ready for check-flight review.");
  const definition = (await listQualificationDefinitions()).find((item) => item.id === application.qualificationDefinitionId);
  if (!definition) throw new Error("Qualification programme not found.");
  const now = new Date().toISOString();
  const nextStatus: TrainingApplicationStatus = outcome === "passed" ? "type_rating_issued" : outcome === "retry" ? "training_in_progress" : "failed";
  let qualificationId: string | null = null;
  const client = clientOrThrow();
  if (!client) {
    const state = await readLocalState();
    const current = state.applications.find((item) => item.id === applicationId)!;
    current.status = nextStatus;
    current.checkFlightOutcome = outcome;
    current.checkFlightReviewedBy = staffMember;
    current.checkFlightReviewedAt = now;
    current.checkFlightPirepId = checkFlightPirepId ?? null;
    current.staffNote = note.trim().slice(0, 2000) || null;
    current.updatedAt = now;
    if (outcome === "passed") {
      const qualification: PilotQualification = { id: randomUUID(), pilotId: application.pilotId, qualificationDefinitionId: definition.id, status: "valid", source: "training", issuedAt: now, issuedBy: staffMember, trainingApplicationId: applicationId, checkFlightPirepId: checkFlightPirepId ?? null, validFrom: now, validUntil: addMonths(new Date(now), definition.validityMonths), lastRecurrentAt: now, nextRecurrentAt: addMonths(new Date(now), definition.recurrentIntervalMonths), staffNote: note.trim().slice(0, 2000) || null };
      state.qualifications = state.qualifications.filter((item) => !(item.pilotId === qualification.pilotId && item.qualificationDefinitionId === qualification.qualificationDefinitionId));
      state.qualifications.push(qualification);
      qualificationId = qualification.id;
    }
    await writeLocalState(state);
  } else {
    const { error } = await client.from("training_applications").update({ status: nextStatus, check_flight_outcome: outcome, check_flight_reviewed_by: staffMember, check_flight_reviewed_at: now, check_flight_pirep_id: checkFlightPirepId ?? null, staff_note: note.trim().slice(0, 2000) || null, updated_at: now }).eq("id", applicationId);
    if (error) throw error;
    if (outcome === "passed") {
      const { data, error: qualificationError } = await client.from("pilot_qualifications").upsert({ pilot_id: application.pilotId, qualification_definition_id: definition.id, status: "valid", source: "training", issued_at: now, issued_by: staffMember, training_application_id: applicationId, check_flight_pirep_id: checkFlightPirepId ?? null, valid_from: now, valid_until: addMonths(new Date(now), definition.validityMonths), last_recurrent_at: now, next_recurrent_at: addMonths(new Date(now), definition.recurrentIntervalMonths), staff_note: note.trim().slice(0, 2000) || null, updated_at: now }, { onConflict: "pilot_id,qualification_definition_id" }).select("id").single();
      if (qualificationError) throw qualificationError;
      qualificationId = String((data as { id: string }).id);
    }
  }
  await audit({ pilotId: application.pilotId, trainingApplicationId: applicationId, qualificationId, action: outcome === "passed" ? "qualification_issued" : `check_flight_${outcome}`, oldValue: { status: application.status }, newValue: { status: nextStatus, outcome }, reason: note.trim() || null, staffMember });
}

export async function manuallyIssueQualification(input: { pilotId: string; definitionId: string; staffMember: string; reason: string; source?: "manual" | "grandfathered" }) {
  const definition = (await listQualificationDefinitions()).find((item) => item.id === input.definitionId);
  if (!definition) throw new Error("Qualification programme not found.");
  const reason = input.reason.trim().slice(0, 2000);
  if (reason.length < 3) throw new Error("A reason is required for manual qualification issuance.");
  const now = new Date().toISOString();
  const source: QualificationSource = input.source === "grandfathered" ? "grandfathered" : "manual";
  const client = clientOrThrow();
  let qualificationId: string;
  if (!client) {
    const state = await readLocalState();
    const qualification: PilotQualification = { id: randomUUID(), pilotId: input.pilotId, qualificationDefinitionId: definition.id, status: "valid", source, issuedAt: now, issuedBy: input.staffMember, trainingApplicationId: null, checkFlightPirepId: null, validFrom: now, validUntil: addMonths(new Date(now), definition.validityMonths), lastRecurrentAt: now, nextRecurrentAt: addMonths(new Date(now), definition.recurrentIntervalMonths), staffNote: reason };
    state.qualifications = state.qualifications.filter((item) => !(item.pilotId === qualification.pilotId && item.qualificationDefinitionId === qualification.qualificationDefinitionId));
    state.qualifications.push(qualification);
    await writeLocalState(state);
    qualificationId = qualification.id;
  } else {
    const { data, error } = await client.from("pilot_qualifications").upsert({ pilot_id: input.pilotId, qualification_definition_id: definition.id, status: "valid", source, issued_at: now, issued_by: input.staffMember, valid_from: now, valid_until: addMonths(new Date(now), definition.validityMonths), last_recurrent_at: now, next_recurrent_at: addMonths(new Date(now), definition.recurrentIntervalMonths), staff_note: reason, updated_at: now }, { onConflict: "pilot_id,qualification_definition_id" }).select("id").single();
    if (error) throw error;
    qualificationId = String((data as { id: string }).id);
  }
  await audit({ pilotId: input.pilotId, trainingApplicationId: null, qualificationId, action: source === "grandfathered" ? "qualification_grandfathered" : "qualification_manually_issued", oldValue: null, newValue: { definitionId: definition.id, source }, reason, staffMember: input.staffMember });
}

export async function getCareerDashboard(pilot: PilotAccount): Promise<CareerDashboard> {
  const [economy, finance, qualifications, applications, definitions, transactions] = await Promise.all([
    getCareerEconomySettings(), getPilotFinanceAccount(pilot.id), listPilotQualifications(pilot.id), listPilotTrainingApplications(pilot.id), listQualificationDefinitions(), listPilotFinanceTransactions(pilot.id),
  ]);
  return { economy, finance, qualifications: [...qualifications, ...legacyGrandfatheredQualifications(pilot).filter((legacy) => !qualifications.some((item) => item.qualificationDefinitionId === legacy.qualificationDefinitionId))], applications, definitions, transactions };
}

export function calculatePilotFlightPay(input: { pilot: PilotAccount; pirep: Pick<PilotPirep, "blockMinutes" | "aircraft">; economy: CareerEconomySettings; hasCommandQualification?: boolean; hasInstructorQualification?: boolean; }) {
  const family = aircraftFamilyForModel(input.pirep.aircraft);
  const multiplier = input.economy.aircraftMultipliers[family];
  const blockHours = Math.max(0, input.pirep.blockMinutes) / 60;
  const basePay = blockHours * input.economy.rankHourlyRates[input.pilot.rank] * multiplier;
  const longHaulAllowance = input.pirep.blockMinutes >= input.economy.longHaulThresholdMinutes ? input.economy.longHaulAllowance : 0;
  const commandBonus = input.hasCommandQualification ? input.economy.commandBonus : 0;
  const instructorBonus = input.hasInstructorQualification ? input.economy.instructorBonus : 0;
  return { amount: roundMoney(basePay + input.economy.sectorAllowance + longHaulAllowance + commandBonus + instructorBonus), components: { basePay: roundMoney(basePay), sectorAllowance: input.economy.sectorAllowance, longHaulAllowance, commandBonus, instructorBonus, multiplier } };
}

export async function creditAcceptedPirepSalary(pilot: PilotAccount, pirep: Pick<PilotPirep, "id" | "blockMinutes" | "aircraft" | "flightNumber" | "from" | "to">) {
  const [economy, qualifications] = await Promise.all([getCareerEconomySettings(), listPilotQualifications(pilot.id)]);
  const active = activeQualificationIds(pilot, qualifications);
  const pay = calculatePilotFlightPay({ pilot, pirep, economy, hasCommandQualification: active.has("COMMAND") });
  return postFinanceTransaction({ pilotId: pilot.id, idempotencyKey: `accepted-pirep-pay:${pirep.id}`, category: "flight_pay", amount: pay.amount, description: `${pirep.flightNumber} ${pirep.from}–${pirep.to} virtual flight pay`, relatedPirepId: pirep.id, createdAutomatically: true });
}

export async function checkAircraftCareerEligibility(pilot: PilotAccount, aircraft: string): Promise<AircraftCareerEligibility> {
  const requiredRating = ratingForAircraft(aircraft);
  const qualifications = await listPilotQualifications(pilot.id);
  const active = activeQualificationIds(pilot, qualifications);
  const reasons: string[] = [];
  if (requiredRating && !active.has(requiredRating)) reasons.push(`${requiredRating.replaceAll("_", " ")} qualification required.`);
  const commandRequired = false;
  if (commandRequired && !active.has("COMMAND")) reasons.push("Command qualification required for this assignment.");
  return { eligible: reasons.length === 0, role: active.has("COMMAND") ? "captain" : "first_officer", requiredRating: requiredRating ?? null, reasons };
}
