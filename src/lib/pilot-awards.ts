export const PILOT_CAREER_AWARDS = [
  { id: "first-flight", title: "First Flight", flightThreshold: 1, description: "Completed and accepted a first BAV flight." },
  { id: "ten-flights", title: "Ten Flights", flightThreshold: 10, description: "Completed ten accepted BAV flights." },
  { id: "fifty-flights", title: "Fifty Flights", flightThreshold: 50, description: "Completed fifty accepted BAV flights." },
  { id: "one-hundred-flights", title: "Century Flyer", flightThreshold: 100, description: "Completed one hundred accepted BAV flights." },
  { id: "two-hundred-fifty-flights", title: "Quarter Millennium", flightThreshold: 250, description: "Completed two hundred and fifty accepted BAV flights." },
  { id: "five-hundred-flights", title: "Five Hundred Club", flightThreshold: 500, description: "Completed five hundred accepted BAV flights." },
  { id: "one-thousand-flights", title: "Thousand Flight Club", flightThreshold: 1_000, description: "Completed one thousand accepted BAV flights." },
] as const;

export type PilotCareerAwardId = (typeof PILOT_CAREER_AWARDS)[number]["id"];

export function isPilotCareerAwardId(value: unknown): value is PilotCareerAwardId {
  return typeof value === "string" && PILOT_CAREER_AWARDS.some((award) => award.id === value);
}

export function getPilotCareerAward(id: PilotCareerAwardId) {
  return PILOT_CAREER_AWARDS.find((award) => award.id === id)!;
}

/** Awards are unlocked only when a pilot reaches the exact accepted-flight milestone. */
export function awardsForAcceptedFlightCount(flightCount: number, existing: readonly { id: PilotCareerAwardId }[]) {
  const alreadyEarned = new Set(existing.map((award) => award.id));
  return PILOT_CAREER_AWARDS.filter((award) => award.flightThreshold === flightCount && !alreadyEarned.has(award.id));
}
