export const PILOT_RANKS = [
  "Cadet",
  "Second Officer",
  "First Officer",
  "Senior First Officer",
  "Captain",
  "Senior Captain",
  "Training Captain",
] as const;

export type PilotRank = (typeof PILOT_RANKS)[number];

/** Only these five ranks are awarded automatically from accepted career hours. */
export const PILOT_RANK_THRESHOLDS: Array<{ rank: PilotRank; minimumHours: number }> = [
  { rank: "Cadet", minimumHours: 0 },
  { rank: "Second Officer", minimumHours: 25 },
  { rank: "First Officer", minimumHours: 250 },
  { rank: "Senior First Officer", minimumHours: 1_000 },
  { rank: "Captain", minimumHours: 2_500 },
];

export const PILOT_TYPE_RATINGS = [
  { id: "a350", label: "Airbus A350 type rating", aircraftLabel: "Airbus A350 family" },
  { id: "b777", label: "Boeing 777 type rating", aircraftLabel: "Boeing 777 family" },
  { id: "b787", label: "Boeing 787 type rating", aircraftLabel: "Boeing 787 family" },
] as const;

export type PilotTypeRating = (typeof PILOT_TYPE_RATINGS)[number]["id"];

export type PilotAircraftEligibility = {
  eligible: boolean;
  category: "regional" | "short-haul" | "long-haul";
  requiredRating: PilotTypeRating | null;
  reason: string;
};

export function isPilotRank(value: unknown): value is PilotRank {
  return typeof value === "string" && (PILOT_RANKS as readonly string[]).includes(value);
}

export function isPilotTypeRating(value: unknown): value is PilotTypeRating {
  return typeof value === "string" && PILOT_TYPE_RATINGS.some((rating) => rating.id === value);
}

export function normalizePilotTypeRatings(value: unknown): PilotTypeRating[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isPilotTypeRating))];
}

export function automaticPilotRank(hours: number): PilotRank {
  const safeHours = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  let rank: PilotRank = "Cadet";
  for (const level of PILOT_RANK_THRESHOLDS) {
    if (safeHours >= level.minimumHours) rank = level.rank;
  }
  return rank;
}

export function nextPilotRank(hours: number) {
  const safeHours = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  return PILOT_RANK_THRESHOLDS.find((level) => level.minimumHours > safeHours) ?? null;
}

function rankAtLeast(rank: PilotRank, minimum: PilotRank) {
  return PILOT_RANKS.indexOf(rank) >= PILOT_RANKS.indexOf(minimum);
}

export function typeRatingForAircraft(aircraft: string): PilotTypeRating | null {
  const normalized = aircraft.toLowerCase();
  if (normalized.includes("a350")) return "a350";
  if (normalized.includes("777")) return "b777";
  if (normalized.includes("787")) return "b787";
  return null;
}

/**
 * Cadets begin on supervised regional and A320-family sectors. Long-haul
 * requires Senior First Officer standing plus a staff-approved type rating.
 */
export function getPilotAircraftEligibility(input: { rank: PilotRank; typeRatings: readonly PilotTypeRating[]; aircraft: string }): PilotAircraftEligibility {
  const longHaulRating = typeRatingForAircraft(input.aircraft);
  if (longHaulRating) {
    const rating = PILOT_TYPE_RATINGS.find((item) => item.id === longHaulRating)!;
    if (!rankAtLeast(input.rank, "Senior First Officer")) {
      return { eligible: false, category: "long-haul", requiredRating: longHaulRating, reason: `${rating.aircraftLabel} operations require Senior First Officer rank and an approved ${rating.label}.` };
    }
    if (!input.typeRatings.includes(longHaulRating)) {
      return { eligible: false, category: "long-haul", requiredRating: longHaulRating, reason: `An approved ${rating.label} is required for this service.` };
    }
    return { eligible: true, category: "long-haul", requiredRating: longHaulRating, reason: `${rating.label} approved.` };
  }

  const normalized = input.aircraft.toLowerCase();
  const isRegional = normalized.includes("embraer") || normalized.includes("e190");
  const isA321 = normalized.includes("a321");
  if (isA321 && !rankAtLeast(input.rank, "Second Officer")) {
    return { eligible: false, category: "short-haul", requiredRating: null, reason: "A321 operations unlock at Second Officer rank (25 accepted BAV hours)." };
  }
  if (!isRegional && !normalized.includes("a319") && !normalized.includes("a320") && !isA321 && !rankAtLeast(input.rank, "First Officer")) {
    return { eligible: false, category: "short-haul", requiredRating: null, reason: "This aircraft type unlocks at First Officer rank (250 accepted BAV hours)." };
  }
  return { eligible: true, category: isRegional ? "regional" : "short-haul", requiredRating: null, reason: isRegional ? "Regional operations approved." : "Short-haul operations approved." };
}

export function formatPilotTypeRatings(ratings: readonly PilotTypeRating[]) {
  const labels = ratings.map((rating) => PILOT_TYPE_RATINGS.find((item) => item.id === rating)?.aircraftLabel).filter(Boolean);
  return labels.length ? labels.join(" · ") : "No long-haul type ratings approved";
}
