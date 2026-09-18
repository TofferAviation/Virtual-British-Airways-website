import type { VirtualEvent } from "@/data/events";

export const PILOT_CAREER_AWARDS = [
  { id: "first-flight", title: "First Flight", criterion: "1 accepted flight", order: 10, flightThreshold: 1, description: "Completed and accepted a first BAV flight." },
  { id: "ten-flights", title: "Ten Flights", criterion: "10 accepted flights", order: 20, flightThreshold: 10, description: "Completed ten accepted BAV flights." },
  { id: "fifty-flights", title: "Fifty Flights", criterion: "50 accepted flights", order: 30, flightThreshold: 50, description: "Completed fifty accepted BAV flights." },
  { id: "one-hundred-flights", title: "Century Flyer", criterion: "100 accepted flights", order: 40, flightThreshold: 100, description: "Completed one hundred accepted BAV flights." },
  { id: "two-hundred-fifty-flights", title: "Quarter Millennium", criterion: "250 accepted flights", order: 50, flightThreshold: 250, description: "Completed two hundred and fifty accepted BAV flights." },
  { id: "five-hundred-flights", title: "Five Hundred Club", criterion: "500 accepted flights", order: 60, flightThreshold: 500, description: "Completed five hundred accepted BAV flights." },
  { id: "one-thousand-flights", title: "Thousand Flight Club", criterion: "1,000 accepted flights", order: 70, flightThreshold: 1_000, description: "Completed one thousand accepted BAV flights." },
  { id: "around-the-world", title: "Around the World", criterion: "21,639 NM flown", order: 80, description: "Covered the equivalent of one journey around the world in accepted BAV flights." },
  { id: "long-haul", title: "Long-Haul Flyer", criterion: "One 3,000 NM+ sector", order: 90, description: "Completed and accepted a long-haul BAV sector of at least 3,000 nautical miles." },
  { id: "heathrow-specialist", title: "Heathrow Specialist", criterion: "25 Heathrow departures", order: 100, description: "Completed twenty-five accepted BAV departures from London Heathrow." },
  { id: "a320-family", title: "Airbus A320 Family", criterion: "First A320-family flight", order: 110, description: "Completed an accepted BAV flight in an Airbus A319, A320 or A321." },
  { id: "embraer-regional", title: "Embraer Regional", criterion: "First Embraer flight", order: 120, description: "Completed an accepted BAV flight in an Embraer regional aircraft." },
  { id: "a350", title: "Airbus A350", criterion: "First A350 flight", order: 130, description: "Completed an accepted BAV flight in the Airbus A350." },
  { id: "boeing-777", title: "Boeing 777", criterion: "First Boeing 777 flight", order: 140, description: "Completed an accepted BAV flight in the Boeing 777." },
  { id: "boeing-787", title: "Boeing 787", criterion: "First Boeing 787 flight", order: 150, description: "Completed an accepted BAV flight in the Boeing 787." },
  { id: "event-flyer", title: "BAV Event Participant", criterion: "Accepted official BAV event flight", order: 200, description: "Completed an accepted flight in an official British Airways Virtual event." },
] as const;

export type PilotCareerAwardId = (typeof PILOT_CAREER_AWARDS)[number]["id"];

export type PilotAwardDisplayInput = {
  id: PilotCareerAwardId;
  eventTitle?: string | null;
};

export function isPilotCareerAwardId(value: unknown): value is PilotCareerAwardId {
  return typeof value === "string" && PILOT_CAREER_AWARDS.some((award) => award.id === value);
}

export function getPilotCareerAward(id: PilotCareerAwardId) {
  return PILOT_CAREER_AWARDS.find((award) => award.id === id)!;
}

export function getPilotAwardDisplay(award: PilotAwardDisplayInput) {
  const detail = getPilotCareerAward(award.id);
  return award.id === "event-flyer" && award.eventTitle
    ? { ...detail, title: award.eventTitle, description: "Completed an accepted flight in this official British Airways Virtual event." }
    : detail;
}

export function isHeathrowStation(value: string) {
  return ["LHR", "EGLL"].includes(value.trim().toUpperCase());
}

function aircraftAwardIds(aircraft: string): PilotCareerAwardId[] {
  const normalized = aircraft.trim().toLowerCase();
  const awards: PilotCareerAwardId[] = [];
  if (/a319|a320|a321/.test(normalized)) awards.push("a320-family");
  if (/embraer|e190|e170|e195/.test(normalized)) awards.push("embraer-regional");
  if (/a350/.test(normalized)) awards.push("a350");
  if (/777|b77/.test(normalized)) awards.push("boeing-777");
  if (/787|b78/.test(normalized)) awards.push("boeing-787");
  return awards;
}

/** Returns every unearned permanent award unlocked by one accepted PIREP. */
export function awardsForAcceptedPirep(
  input: { flights: number; totalDistanceNm: number; heathrowDepartures: number; aircraft: string; distanceNm: number },
  existing: readonly { id: PilotCareerAwardId }[],
) {
  const alreadyEarned = new Set(existing.map((award) => award.id));
  const candidates: PilotCareerAwardId[] = [
    ...PILOT_CAREER_AWARDS
      .filter((award) => "flightThreshold" in award && input.flights >= award.flightThreshold)
      .map((award) => award.id),
    ...(input.totalDistanceNm >= 21_639 ? ["around-the-world" as const] : []),
    ...(input.distanceNm >= 3_000 ? ["long-haul" as const] : []),
    ...(input.heathrowDepartures >= 25 ? ["heathrow-specialist" as const] : []),
    ...aircraftAwardIds(input.aircraft),
  ];

  return candidates
    .filter((id, index) => candidates.indexOf(id) === index && !alreadyEarned.has(id))
    .map((id) => getPilotCareerAward(id));
}

function stationCode(value: string) {
  const normalized = value.trim().toUpperCase();
  const aliases: Record<string, string> = { LHR: "EGLL", LGW: "EGKK", LCY: "EGLC", JFK: "KJFK", HND: "RJTT", VIE: "LOWW", AMS: "EHAM", GVA: "LSGG", EDI: "EGPH" };
  return aliases[normalized] ?? normalized;
}

/** An event award requires the published event date and primary route to match the accepted PIREP. */
export function getMatchingBavEvent(
  input: { from: string; to: string; completedAt: string },
  events: readonly VirtualEvent[],
) {
  const completed = new Date(input.completedAt);
  if (Number.isNaN(completed.valueOf())) return null;
  const completedDate = completed.toISOString().slice(0, 10);
  return events.find((event) => (
    event.published &&
    event.date === completedDate &&
    stationCode(event.route.from) === stationCode(input.from) &&
    stationCode(event.route.to) === stationCode(input.to)
  )) ?? null;
}
