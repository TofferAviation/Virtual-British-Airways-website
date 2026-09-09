export const PILOT_RANKS = [
  "Second Officer",
  "First Officer",
  "Senior First Officer",
  "Captain",
] as const;

export type PilotRank = (typeof PILOT_RANKS)[number];

export const PILOT_RANK_THRESHOLDS: Array<{ rank: PilotRank; minimumHours: number }> = [
  { rank: "Second Officer", minimumHours: 0 },
  { rank: "First Officer", minimumHours: 250 },
  { rank: "Senior First Officer", minimumHours: 1500 },
  { rank: "Captain", minimumHours: 3000 },
];

export function isPilotRank(value: unknown): value is PilotRank {
  return typeof value === "string" && (PILOT_RANKS as readonly string[]).includes(value);
}

export function automaticPilotRank(hours: number): PilotRank {
  const safeHours = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  let rank: PilotRank = "Second Officer";
  for (const level of PILOT_RANK_THRESHOLDS) {
    if (safeHours >= level.minimumHours) rank = level.rank;
  }
  return rank;
}

export function nextPilotRank(hours: number) {
  const safeHours = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  return PILOT_RANK_THRESHOLDS.find((level) => level.minimumHours > safeHours) ?? null;
}
