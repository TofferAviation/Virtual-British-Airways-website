/**
 * Optional, pilot-owned preferences for the Career experience.
 *
 * This deliberately lives alongside (rather than inside) the established
 * finance and qualification domain. It must never award ranks, credits,
 * qualifications, currency or operational privileges.
 */
export const CAREER_EXPERIENCE_MODES = ["fly", "career", "realistic_operations"] as const;
export const CAREER_FOCUS_OPTIONS = ["explore", "progression", "operations"] as const;

export type CareerExperienceMode = (typeof CAREER_EXPERIENCE_MODES)[number];
export type CareerFocus = (typeof CAREER_FOCUS_OPTIONS)[number];

export type CareerExperiencePreferences = {
  version: 1;
  mode: CareerExperienceMode;
  focus: CareerFocus;
  updatedAt: string;
};

export type CareerFeature = "experience" | "dispatcher" | "debrief" | "fleet" | "rosters" | "advanced_operations" | "mentoring" | "passport";
export type CareerFeatureState = "disabled" | "staff" | "enabled";

const FEATURE_ENV: Record<CareerFeature, string> = {
  experience: "BAV_FEATURE_CAREER_EXPERIENCE",
  dispatcher: "BAV_FEATURE_CAREER_DISPATCHER",
  debrief: "BAV_FEATURE_CAREER_DEBRIEF",
  fleet: "BAV_FEATURE_CAREER_FLEET",
  rosters: "BAV_FEATURE_CAREER_ROSTERS",
  advanced_operations: "BAV_FEATURE_CAREER_ADVANCED_OPERATIONS",
  mentoring: "BAV_FEATURE_CAREER_MENTORING",
  passport: "BAV_FEATURE_CAREER_PASSPORT",
};

function isMode(value: unknown): value is CareerExperienceMode {
  return typeof value === "string" && (CAREER_EXPERIENCE_MODES as readonly string[]).includes(value);
}

function isFocus(value: unknown): value is CareerFocus {
  return typeof value === "string" && (CAREER_FOCUS_OPTIONS as readonly string[]).includes(value);
}

function validTimestamp(value: unknown, fallback: string) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : fallback;
}

export function createCareerExperiencePreferences(now = new Date().toISOString()): CareerExperiencePreferences {
  return { version: 1, mode: "fly", focus: "explore", updatedAt: now };
}

export function normalizeCareerExperiencePreferences(value: unknown, fallbackTimestamp = new Date().toISOString()): CareerExperiencePreferences {
  const raw = value && typeof value === "object" ? value as Partial<CareerExperiencePreferences> : {};
  return { version: 1, mode: isMode(raw.mode) ? raw.mode : "fly", focus: isFocus(raw.focus) ? raw.focus : "explore", updatedAt: validTimestamp(raw.updatedAt, fallbackTimestamp) };
}

export function validateCareerExperiencePreferences(input: unknown): Pick<CareerExperiencePreferences, "mode" | "focus"> {
  const raw = input && typeof input === "object" ? input as { mode?: unknown; focus?: unknown } : {};
  if (!isMode(raw.mode)) throw new Error("Choose how you would like to fly.");
  if (!isFocus(raw.focus)) throw new Error("Choose a current career focus.");
  return { mode: raw.mode, focus: raw.focus };
}

/** Unset is intentionally safe: a new module is invisible until enabled. */
export function careerFeatureState(feature: CareerFeature): CareerFeatureState {
  const value = process.env[FEATURE_ENV[feature]]?.trim().toLowerCase();
  return value === "enabled" || value === "staff" ? value : "disabled";
}

export function isCareerFeatureEnabled(feature: CareerFeature, staff = false) {
  const state = careerFeatureState(feature);
  return state === "enabled" || (state === "staff" && staff);
}
