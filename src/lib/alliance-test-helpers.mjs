import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
export function loadTs(relative, overrides = {}, cache = new Map()) {
  const url = new URL(relative, import.meta.url);
  if (cache.has(url.href)) return cache.get(url.href);
  const code = ts.transpileModule(readFileSync(url, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {}; cache.set(url.href, exports);
  new Function("require", "exports", code)(name => {
    if (name in overrides) return overrides[name];
    if (name.endsWith(".css")) return {};
    if (name.startsWith("@/")) {
      const stem = `../${name.slice(2)}`;
      return loadTs(`${stem}${existsSync(new URL(`${stem}.ts`, import.meta.url)) ? ".ts" : ".tsx"}`, overrides, cache);
    }
    if (name.startsWith(".")) return loadTs(new URL(`${name}.ts`, url).href, overrides, cache);
    return require(name);
  }, exports);
  return exports;
}
export const { DEFAULT_REWARD_SETTINGS: rewards } = loadTs("./reward-settings.ts");
export const { prepareAllianceCredit } = loadTs("./alliance-credit.ts");
export const { allianceBalances, validateAllianceSchedule, carrierEligible, scheduleAvailable } = loadTs("./alliance.ts");
// Explicit test fixture. NOT a published route or an asserted real timetable.
export const fixtureSchedule = {
  id: "test-fixture-qr", operatorId: "QR", marketingCarrierId: "QR", flightNumber: "QR1", operatingFlightNumber: "QR1", callsign: "QTR1", origin: "OTHH", destination: "EGLL", originIata: "DOH", destinationIata: "LHR", originCountry: "Qatar", destinationCountry: "United Kingdom", region: "Test fixture", aircraft: "Airbus A350-1000", aircraftIcao: "A35K", departure: "08:00", arrival: "14:25", blockSeconds: 23100, distanceNm: 2900, days: [0,1,2,3,4,5,6], validFrom: "2026-11-06", validUntil: "2027-01-01", sourceUrl: "https://example.org/test-fixture", permission: "TEST FIXTURE ONLY; not a real timetable", verifiedAt: "2026-11-06T00:00:00Z", sourceType: "virtual", confidence: "low", enabled: true,
};
export const snapshot = {
  schedule: fixtureSchedule,
  operator: { id: "QR", name: "Qatar Airways", iata: "QR", icao: "QTR", parentId: null, enabled: true, eligible: true, validFrom: "2026-11-06", validUntil: null },
  marketing: { id: "QR", name: "Qatar Airways", iata: "QR", icao: "QTR", parentId: null, enabled: true, eligible: true, validFrom: "2026-11-06", validUntil: null },
  policy: { version: "alliance-v1", career: true, rank: true, salary: true, points: true, tierPoints: true, requireDispatchApproval: false, milestones: [36000,180000,360000], xpPerHour: 100 }, mode: "career", dispatchApproved: false,
};
export const pilot = {
  id: "test-pilot", pilotNumber: "BAV-TEST", name: "Test fixture pilot", email: "fixture@example.invalid", passwordHash: "test-not-real", status: "active", flights: 10, hours: 250, rank: "First Officer", rankOverride: null, points: 100, tierPoints: 100, lifetimeTierPoints: 100, distanceNm: 5000, heathrowDepartures: 0, streak: 0, awards: [], averageLanding: null, bestLanding: null, careerExperience: { mode: "career" },
};
export const pirep = { id: "11111111-1111-4111-8111-111111111111", pilotId: pilot.id, bookingId: "22222222-2222-4222-8222-222222222222", flightNumber: "QR1", from: "OTHH", to: "EGLL", aircraft: "Airbus A350-1000", startedAt: "2026-11-06T08:00:00Z", completedAt: "2026-11-06T14:25:00Z", blockMinutes: 385, distanceNm: 2900, landingFpm: -100, pointsAwarded: 0, tierPointsAwarded: 0, status: "pending", source: "manual", simulator: "msfs2024", pilotComments: "TEST FIXTURE", staffComments: "", createdAt: "2026-11-06T15:00:00Z" };
export function mutation(overrides = {}) {
  return prepareAllianceCredit({ pilot, pirep, snapshot, history: [], review: { decision: "accepted", reason: "Test fixture approved", actor: "test-staff", expectedRevision: 0 }, rewards, points: 100, tierPoints: 40, salary: 300, now: "2026-11-06T16:00:00Z", ...overrides });
}
export function persisted(entry) { return { ...entry, id: `ledger-${entry.revision}`, createdAt: "2026-11-06T16:00:00Z" }; }
