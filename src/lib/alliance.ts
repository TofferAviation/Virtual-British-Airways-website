/** Shared, browser-safe alliance contracts. All time is integer seconds. */
export type AllianceCarrier = { id: string; name: string; iata: string; icao: string; parentId: string | null; enabled: boolean; eligible: boolean; validFrom: string; validUntil: string | null };
export type AlliancePolicy = { version: string; career: boolean; salary: boolean; points: boolean; tierPoints: boolean; rank: boolean; requireDispatchApproval: boolean; milestones: number[]; xpPerHour?: number };
export type AllianceSettings = { enabled: boolean; policy: AlliancePolicy };
export type AllianceSchedule = {
  id: string; operatorId: string; marketingCarrierId: string; flightNumber: string; operatingFlightNumber: string; callsign: string;
  origin: string; destination: string; originIata: string; destinationIata: string;
  originCountry: string; destinationCountry: string; region: string; aircraft: string; aircraftIcao: string;
  departure: string; arrival: string; blockSeconds: number; distanceNm: number; days: number[];
  validFrom: string; validUntil: string; sourceUrl: string; permission: string; verifiedAt: string;
  sourceType: "verified" | "historical" | "manual" | "virtual"; enabled: boolean;
  confidence: "high" | "medium" | "low";
};
export type AllianceBookingSnapshot = { schedule: AllianceSchedule; operator: AllianceCarrier; marketing: AllianceCarrier; policy: AlliancePolicy; mode: "fly" | "career" | "realistic_operations"; dispatchApproved: boolean };
export type AllianceLedgerEntry = { id: string; pirepId: string; pilotId: string; carrierId: string; revision: number; kind: "approval" | "reversal" | "adjustment"; seconds: number; careerSeconds: number; sectors: number; distanceNm: number; points: number; tierPoints: number; salary: number; xp: number; policy: AlliancePolicy; reason: string; actor: string; createdAt: string; flight: { flightNumber: string; from: string; to: string; aircraft: string; completedAt: string } };

export function secondsDisplay(seconds: number) {
  const value = Math.abs(Math.round(seconds));
  return `${seconds < 0 ? "−" : ""}${Math.floor(value / 3600)}h ${String(Math.floor(value % 3600 / 60)).padStart(2, "0")}m`;
}

export function carrierEligible(carrier: AllianceCarrier, date: string) {
  return carrier.enabled && carrier.eligible && carrier.validFrom <= date && (!carrier.validUntil || carrier.validUntil >= date);
}

export function scheduleAvailable(schedule: AllianceSchedule, date: string) {
  const day = new Date(`${date}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === date && schedule.enabled && schedule.validFrom <= date && schedule.validUntil >= date;
}

const text = (value: unknown, name: string, max = 300) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`${name} is required (maximum ${max} characters).`);
  return value.trim();
};
export function validateAllianceSchedule(raw: unknown): AllianceSchedule {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Each schedule must be an object.");
  const r = raw as Record<string, unknown>;
  const string = (name: string, max?: number) => text(r[name], name, max);
  const code = (name: string, pattern: RegExp) => { const value = string(name, 30).toUpperCase(); if (!pattern.test(value)) throw new Error(`Invalid ${name}.`); return value; };
  const date = (name: string) => { const value = string(name, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error(`Invalid ${name}.`); return value; };
  const integer = (name: string, min: number, max: number) => { const value = r[name]; if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}.`); return value; };
  const optional = (name: string, max: number) => r[name] == null || r[name] === "" ? "" : string(name, max);
  const time = (name: string) => r[name] == null || r[name] === "" ? "" : code(name, /^(?:[01]\d|2[0-3]):[0-5]\d$/);
  const sourceType = string("sourceType") as AllianceSchedule["sourceType"];
  const confidence = string("confidence") as AllianceSchedule["confidence"];
  if (!["high", "medium", "low"].includes(confidence)) throw new Error("Record the staff-assessed source confidence: high, medium or low.");
  if (!["verified", "historical", "manual", "virtual"].includes(sourceType)) throw new Error("Label the schedule as verified, historical, manual or virtual.");
  const sourceUrl = string("sourceUrl", 1000);
  if (!/^https:\/\//.test(sourceUrl)) throw new Error("A public HTTPS source/reference URL is required.");
  const verifiedAt = string("verifiedAt", 40);
  if (!Number.isFinite(Date.parse(verifiedAt)) || Date.parse(verifiedAt) > Date.now() + 60_000) throw new Error("Invalid verification timestamp.");
  const days = r.days ?? [0, 1, 2, 3, 4, 5, 6];
  if (!Array.isArray(days) || !days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("days must contain UTC weekdays 0–6.");
  const result: AllianceSchedule = {
    id: code("id", /^[a-zA-Z0-9_-]{1,100}$/).toLowerCase(), operatorId: string("operatorId", 40), marketingCarrierId: string("marketingCarrierId", 40),
    flightNumber: code("flightNumber", /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/), operatingFlightNumber: code("operatingFlightNumber", /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/), callsign: code("callsign", /^[A-Z]{3}[A-Z0-9]{1,7}$/),
    origin: code("origin", /^[A-Z]{4}$/), destination: code("destination", /^[A-Z]{4}$/), originIata: code("originIata", /^[A-Z]{3}$/), destinationIata: code("destinationIata", /^[A-Z]{3}$/),
    originCountry: string("originCountry", 80), destinationCountry: string("destinationCountry", 80), region: string("region", 80), aircraft: optional("aircraft", 80), aircraftIcao: r.aircraftIcao ? code("aircraftIcao", /^[A-Z0-9]{2,4}$/) : "",
    departure: time("departure"), arrival: time("arrival"), blockSeconds: r.blockSeconds == null ? 0 : integer("blockSeconds", 0, 172800), distanceNm: r.distanceNm == null ? 0 : integer("distanceNm", 0, 15000), days: [...new Set(days)],
    validFrom: date("validFrom"), validUntil: date("validUntil"), sourceUrl, permission: string("permission", 1000), verifiedAt, sourceType, confidence, enabled: r.enabled === true,
  };
  if (result.origin === result.destination || result.validUntil < result.validFrom) throw new Error("Invalid route or schedule validity range.");
  if (Boolean(result.aircraft) !== Boolean(result.aircraftIcao)) throw new Error("Reference aircraft name and ICAO code must be supplied together, or both omitted.");
  return result;
}

/** Balances are projections of the immutable ledger; there is no second editable total. */
export function allianceBalances(entries: AllianceLedgerEntry[]) {
  const banks = new Map<string, { carrierId: string; seconds: number; sectors: number; distanceNm: number; aircraft: Set<string>; destinations: Set<string>; routes: Set<string>; lastFlight: string | null }>();
  const active = new Map<string, AllianceLedgerEntry[]>();
  for (const entry of entries) active.set(entry.pirepId, [...(active.get(entry.pirepId) ?? []), entry]);
  for (const rows of active.values()) {
    const seconds = rows.reduce((sum, e) => sum + e.seconds, 0), sectors = rows.reduce((sum, e) => sum + e.sectors, 0), distanceNm = rows.reduce((sum, e) => sum + e.distanceNm, 0);
    const first = rows.find(e => e.kind === "approval");
    if (!first || sectors <= 0) continue;
    const bank = banks.get(first.carrierId) ?? { carrierId: first.carrierId, seconds: 0, sectors: 0, distanceNm: 0, aircraft: new Set<string>(), destinations: new Set<string>(), routes: new Set<string>(), lastFlight: null };
    bank.seconds += seconds; bank.sectors += sectors; bank.distanceNm += distanceNm; bank.aircraft.add(first.flight.aircraft); bank.destinations.add(first.flight.to); bank.routes.add(`${first.flight.from}–${first.flight.to}`);
    if (!bank.lastFlight || first.flight.completedAt > bank.lastFlight) bank.lastFlight = first.flight.completedAt;
    banks.set(bank.carrierId, bank);
  }
  return [...banks.values()].sort((a, b) => b.seconds - a.seconds).map(b => ({ ...b, aircraft: [...b.aircraft], destinations: [...b.destinations], routes: [...b.routes] }));
}

/** Achievement history follows booked policy versions, never a newer threshold. */
export function allianceMilestones(entries: AllianceLedgerEntry[]) {
  const balances = new Map<string, number>();
  const achievements = new Map<string, { pilotId: string; carrierId: string; seconds: number; achievedAt: string; policyVersion: string; active: boolean }>();
  for (const entry of [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.revision - b.revision)) {
    const bankKey = `${entry.pilotId}:${entry.carrierId}`;
    const balance = (balances.get(bankKey) ?? 0) + entry.seconds; balances.set(bankKey, balance);
    for (const seconds of entry.policy.milestones) {
      const key = `${bankKey}:${seconds}`;
      if (balance >= seconds && !achievements.has(key)) achievements.set(key, { pilotId: entry.pilotId, carrierId: entry.carrierId, seconds, achievedAt: entry.createdAt, policyVersion: entry.policy.version, active: true });
    }
  }
  return [...achievements.values()].map(a => ({ ...a, active: (balances.get(`${a.pilotId}:${a.carrierId}`) ?? 0) >= a.seconds }));
}
