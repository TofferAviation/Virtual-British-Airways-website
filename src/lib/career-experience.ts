/**
 * Optional, pilot-owned preferences for the Career experience.
 *
 * This deliberately lives alongside (rather than inside) the established
 * finance and qualification domain. It must never award ranks, credits,
 * qualifications, currency or operational privileges.
 */
export const CAREER_EXPERIENCE_MODES = ["fly", "career", "realistic_operations"] as const;
export const CAREER_FOCUS_OPTIONS = ["explore", "progression", "operations"] as const;
export const CAREER_PATHS = ["network_explorer", "short_haul_specialist", "long_haul_explorer", "aircraft_specialist"] as const;

export type CareerExperienceMode = (typeof CAREER_EXPERIENCE_MODES)[number];
export type CareerFocus = (typeof CAREER_FOCUS_OPTIONS)[number];
export type CareerPath = (typeof CAREER_PATHS)[number];

/** Browser-safe labels for the optional, pilot-owned Career Path selector. */
export const CAREER_PATH_DETAILS: Record<CareerPath, { label: string; description: string; target: number; targetLabel: string }> = {
  network_explorer: { label: "Network explorer", description: "Build a passport of destinations across the BAV network.", target: 5, targetLabel: "different destinations" },
  short_haul_specialist: { label: "Short-haul specialist", description: "Build confident experience on compact, frequent sectors.", target: 8, targetLabel: "accepted short-haul sectors" },
  long_haul_explorer: { label: "Long-haul explorer", description: "Take on the preparation and endurance of longer network sectors.", target: 4, targetLabel: "accepted long-haul sectors" },
  aircraft_specialist: { label: "Aircraft specialist", description: "Develop a personal portfolio on one aircraft type.", target: 10, targetLabel: "accepted sectors on one type" },
};

export type CareerRotationLeg = {
  routeId: string;
  flightNumber: string;
  from: string;
  to: string;
  aircraft: string;
};

export type ActiveCareerRotation = {
  id: string;
  title: string;
  description: string;
  startedAt: string;
  legs: CareerRotationLeg[];
};

export type CareerExperiencePreferences = {
  version: 1;
  mode: CareerExperienceMode;
  focus: CareerFocus;
  careerPath: CareerPath;
  activeRotation: ActiveCareerRotation | null;
  rosterDays: number[];
  mentoringInterest: "none" | "learn" | "mentor";
  updatedAt: string;
};

export type CareerFeature = "experience" | "dispatcher" | "debrief" | "fleet" | "rosters" | "advanced_operations" | "mentoring" | "passport" | "paths";
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
  paths: "BAV_FEATURE_CAREER_PATHS",
};

function isMode(value: unknown): value is CareerExperienceMode {
  return typeof value === "string" && (CAREER_EXPERIENCE_MODES as readonly string[]).includes(value);
}

function isFocus(value: unknown): value is CareerFocus {
  return typeof value === "string" && (CAREER_FOCUS_OPTIONS as readonly string[]).includes(value);
}

function isCareerPath(value: unknown): value is CareerPath {
  return typeof value === "string" && (CAREER_PATHS as readonly string[]).includes(value);
}

function validTimestamp(value: unknown, fallback: string) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : fallback;
}

export function createCareerExperiencePreferences(now = new Date().toISOString()): CareerExperiencePreferences {
  return { version: 1, mode: "fly", focus: "explore", careerPath: "network_explorer", activeRotation: null, rosterDays: [], mentoringInterest: "none", updatedAt: now };
}

function normalizeActiveCareerRotation(value: unknown): ActiveCareerRotation | null {
  const raw = value && typeof value === "object" ? value as Partial<ActiveCareerRotation> : null;
  if (!raw || typeof raw.id !== "string" || typeof raw.title !== "string" || typeof raw.description !== "string" || !Number.isFinite(Date.parse(raw.startedAt ?? "")) || !Array.isArray(raw.legs) || raw.legs.length < 2 || raw.legs.length > 4) return null;
  const legs = raw.legs.map((leg) => {
    const item = leg && typeof leg === "object" ? leg as Partial<CareerRotationLeg> : {};
    if (typeof item.routeId !== "string" || typeof item.flightNumber !== "string" || typeof item.from !== "string" || typeof item.to !== "string" || typeof item.aircraft !== "string") return null;
    const from = item.from.trim().toUpperCase();
    const to = item.to.trim().toUpperCase();
    if (!/^[A-Z]{3,4}$/.test(from) || !/^[A-Z]{3,4}$/.test(to) || !item.routeId.trim() || !item.flightNumber.trim() || !item.aircraft.trim()) return null;
    return { routeId: item.routeId.trim().slice(0, 120), flightNumber: item.flightNumber.trim().toUpperCase().slice(0, 20), from, to, aircraft: item.aircraft.trim().slice(0, 80) };
  });
  if (legs.some((leg) => leg === null)) return null;
  return { id: raw.id.trim().slice(0, 80), title: raw.title.trim().slice(0, 100), description: raw.description.trim().slice(0, 300), startedAt: raw.startedAt!, legs: legs as CareerRotationLeg[] };
}

export function normalizeCareerExperiencePreferences(value: unknown, fallbackTimestamp = new Date().toISOString()): CareerExperiencePreferences {
  const raw = value && typeof value === "object" ? value as Partial<CareerExperiencePreferences> : {};
  const rosterDays = Array.isArray(raw.rosterDays) ? Array.from(new Set(raw.rosterDays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))).sort() : [];
  const mentoringInterest = raw.mentoringInterest === "learn" || raw.mentoringInterest === "mentor" ? raw.mentoringInterest : "none";
  return { version: 1, mode: isMode(raw.mode) ? raw.mode : "fly", focus: isFocus(raw.focus) ? raw.focus : "explore", careerPath: isCareerPath(raw.careerPath) ? raw.careerPath : "network_explorer", activeRotation: normalizeActiveCareerRotation(raw.activeRotation), rosterDays, mentoringInterest, updatedAt: validTimestamp(raw.updatedAt, fallbackTimestamp) };
}

export function validateMentoringInterest(input: unknown) { const value = input && typeof input === "object" ? (input as { mentoringInterest?: unknown }).mentoringInterest : null; if (value !== "none" && value !== "learn" && value !== "mentor") throw new Error("Choose a mentoring preference."); return value; }

export function validateCareerExperiencePreferences(input: unknown): Pick<CareerExperiencePreferences, "mode" | "focus"> {
  const raw = input && typeof input === "object" ? input as { mode?: unknown; focus?: unknown } : {};
  if (!isMode(raw.mode)) throw new Error("Choose how you would like to fly.");
  if (!isFocus(raw.focus)) throw new Error("Choose a current career focus.");
  return { mode: raw.mode, focus: raw.focus };
}

export function validateCareerPath(input: unknown): CareerPath {
  const value = input && typeof input === "object" ? (input as { careerPath?: unknown }).careerPath : null;
  if (!isCareerPath(value)) throw new Error("Choose a career path.");
  return value;
}

export function validateActiveCareerRotation(input: unknown): ActiveCareerRotation | null {
  if (input === null) return null;
  const rotation = normalizeActiveCareerRotation(input);
  if (!rotation || !rotation.id || !rotation.title || !rotation.description) throw new Error("The selected career rotation is not valid.");
  return rotation;
}

export function validateCareerRosterDays(input: unknown) {
  const raw = input && typeof input === "object" ? input as { rosterDays?: unknown } : {};
  if (!Array.isArray(raw.rosterDays)) throw new Error("Choose one or more availability days, or clear the roster.");
  const days = Array.from(new Set(raw.rosterDays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6))).sort();
  if (days.length !== raw.rosterDays.length) throw new Error("Roster availability contains an invalid day.");
  return days;
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
