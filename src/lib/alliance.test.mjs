import assert from "node:assert/strict";
import { test } from "node:test";
import { mutation, persisted, pilot, pirep, snapshot, rewards, fixtureSchedule, prepareAllianceCredit, allianceBalances, validateAllianceSchedule, carrierEligible, scheduleAvailable, loadTs } from "./alliance-test-helpers.mjs";

test("250h + approved 6h25 yields career 256h25, QR 6h25 and exactly one sector", () => {
  const result = mutation(), ledger = [persisted(result.entry)], bank = allianceBalances(ledger)[0];
  assert.equal(Math.round(result.pilot.hours * 3600), 923100);
  assert.equal(result.pilot.flights, 11); assert.equal(bank.seconds, 23100); assert.equal(bank.sectors, 1);
  assert.equal(result.pilot.allianceUncreditedSeconds, 0); assert.equal(bank.carrierId, "QR");
  assert.equal(pilot.hours, 250); assert.equal(result.points, 100); assert.equal(result.pilot.points, 200);
});
test("repeat/reprocessed approval cannot create a second mutation", () => {
  const first = mutation();
  assert.throws(() => mutation({ pilot: first.pilot, pirep: { ...pirep, status: "accepted" }, history: [persisted(first.entry)], review: { decision: "accepted", reason: "Test replay", actor: "staff", expectedRevision: 1 } }), /already been credited/);
});
test("rejection and changes requested have no career, bank or reward effects", () => {
  for (const decision of ["rejected", "changes_requested"]) {
    const r = mutation({ review: { decision, reason: "Test reject", actor: "staff", expectedRevision: 0 } });
    assert.equal(r.entry, null); assert.deepEqual(r.pilot, pilot); assert.equal(r.status, decision);
  }
});
test("reversal undoes both credits, sectors and rewards while preserving history", () => {
  const first = mutation(), history = [persisted(first.entry)];
  const reverse = mutation({ pilot: first.pilot, pirep: { ...pirep, status: "accepted" }, history, review: { decision: "reverse", reason: "Test reversal", actor: "staff", expectedRevision: 1 } });
  assert.equal(reverse.pilot.hours, 250); assert.equal(reverse.pilot.flights, 10); assert.equal(reverse.pilot.points, 100); assert.equal(reverse.entry.salary, -300);
  assert.equal(allianceBalances([...history, persisted(reverse.entry)]).length, 0); assert.equal(history.length, 1);
});
test("correction uses precise seconds and original policy, then fully reverses", () => {
  const first = mutation(), history = [persisted(first.entry)];
  const adjusted = mutation({ pilot: first.pilot, pirep: { ...pirep, status: "accepted" }, snapshot: { ...snapshot, policy: { ...snapshot.policy, career: false } }, history, review: { decision: "adjust", reason: "Correct test block", actor: "staff", expectedRevision: 1, seconds: 24001 } });
  assert.equal(adjusted.entry.seconds, 901); assert.equal(adjusted.entry.careerSeconds, 901); assert.equal(adjusted.entry.sectors, 0); assert.equal(adjusted.pilot.flights, 11);
  const rows = [...history, persisted(adjusted.entry)]; assert.equal(allianceBalances(rows)[0].seconds, 24001);
  const reverse = mutation({ pilot: adjusted.pilot, pirep: { ...pirep, status: "accepted", blockMinutes: 24001/60 }, history: rows, review: { decision: "reverse", reason: "Reverse correction", actor: "staff", expectedRevision: 2 } });
  assert.equal(reverse.pilot.hours, 250); assert.equal(reverse.pilot.points, 100);
});
test("policy can withhold career, rank and rewards without losing unique flown time", () => {
  const r = mutation({ snapshot: { ...snapshot, policy: { ...snapshot.policy, career: false, salary: false, points: false, tierPoints: false } } });
  assert.equal(r.pilot.hours, 250); assert.equal(r.pilot.allianceUncreditedSeconds, 23100); assert.equal(r.entry.seconds, 23100); assert.equal(r.entry.salary, 0); assert.equal(r.pilot.points, 100);
  const rank = mutation({ pilot: { ...pilot, hours: 249, rank: "Second Officer" }, snapshot: { ...snapshot, policy: { ...snapshot.policy, rank: false } } });
  assert.equal(rank.pilot.rank, "Second Officer"); assert.equal(rank.pilot.allianceRankExcludedSeconds, 23100);
});
test("virtual XP follows the saved policy and reverses exactly once", () => {
  const first = mutation(); assert.equal(first.pilot.allianceXp, 642); assert.equal(first.entry.xp, 642);
  const reverse = mutation({ pilot: first.pilot, pirep: { ...pirep, status: "accepted" }, history: [persisted(first.entry)], review: { decision: "reverse", reason: "Test XP reversal", actor: "staff", expectedRevision: 1 } });
  assert.equal(reverse.pilot.allianceXp, 0); assert.equal(reverse.entry.xp, -642);
});
test("milestone history uses booked policy and records revoked eligibility without deleting history", () => {
  const { allianceMilestones } = loadTs("./alliance.ts");
  const first = mutation({ snapshot: { ...snapshot, policy: { ...snapshot.policy, milestones: [18000] } } });
  const approval = persisted(first.entry), milestones = allianceMilestones([approval]);
  assert.equal(milestones.length, 1); assert.equal(milestones[0].seconds, 18000); assert.equal(milestones[0].active, true);
  const reverse = mutation({ pilot: first.pilot, pirep: { ...pirep, status: "accepted" }, history: [approval], review: { decision: "reverse", reason: "Test milestone reversal", actor: "staff", expectedRevision: 1 } });
  assert.equal(allianceMilestones([approval, persisted(reverse.entry)])[0].active, false);
});
test("missing metadata, historic accepted reports, bad time, stale revision and foreign ledgers fail closed", () => {
  assert.throws(() => mutation({ snapshot: { ...snapshot, operator: { ...snapshot.operator, id: "" } } }), /metadata/);
  assert.throws(() => mutation({ pirep: { ...pirep, status: "accepted" } }), /Historical/);
  assert.throws(() => mutation({ pirep: { ...pirep, blockMinutes: NaN } }), /Invalid/);
  assert.throws(() => mutation({ review: { decision: "accepted", reason: "Test stale", actor: "staff", expectedRevision: 2 } }), /changed/);
  assert.throws(() => mutation({ history: [{ ...persisted(mutation().entry), pilotId: "other" }] }), /does not match/);
});
test("codeshare credit always follows the operating carrier", () => {
  const r = mutation({ snapshot: { ...snapshot, marketing: { ...snapshot.marketing, id: "BA", iata: "BA" } } });
  assert.equal(r.entry.carrierId, "QR");
});
test("current/future membership eligibility is explicit; missing/clear periods do not inherit eligibility", () => {
  assert.equal(carrierEligible(snapshot.operator, "2026-11-06"), true);
  assert.equal(carrierEligible({ ...snapshot.operator, validUntil: "2026-11-07" }, "2026-11-08"), false);
  assert.equal(carrierEligible({ ...snapshot.operator, validFrom: "2027-01-01" }, "2026-11-06"), false);
  assert.equal(carrierEligible({ ...snapshot.operator, eligible: false }, "2026-11-06"), false);
  assert.equal(scheduleAvailable(fixtureSchedule, "2026-11-06"), true); assert.equal(scheduleAvailable(fixtureSchedule, "2026-02-30"), false);
});
test("imports demand provenance, permission, validity, real identifiers and explicit virtual labels", () => {
  assert.equal(validateAllianceSchedule(fixtureSchedule).sourceType, "virtual");
  for (const [key, value] of [["permission", ""], ["sourceUrl", "http://example.org"], ["callsign", "??"], ["days", []], ["verifiedAt", "nonsense"], ["blockSeconds", NaN], ["validUntil", "2026-01-01"]]) assert.throws(() => validateAllianceSchedule({ ...fixtureSchedule, [key]: value }));
});
test("partner SimBrief dispatch preserves verified ICAO airports, operator and airframe", () => {
  const simbrief = loadTs("./simbrief.ts"), booking = { ...pirep, date: "2026-11-06", callsign: "QTR1", departure: "08:00", duration: "6h 25m", alliance: snapshot };
  const url = new URL(simbrief.buildSimbriefDispatchUrl(booking, "Test", "1"));
  assert.equal(url.searchParams.get("airline"), "QTR"); assert.equal(url.searchParams.get("fltnum"), "1"); assert.equal(url.searchParams.get("type"), "A35K"); assert.equal(url.searchParams.get("orig"), "OTHH"); assert.equal(url.searchParams.has("reg"), false);
  assert.throws(() => simbrief.validateAllianceSimbriefPlan(booking, { briefing: { flightNumber: "1", airline: "BAW", aircraftIcao: "A35K" } }), /does not match/);
  assert.doesNotThrow(() => simbrief.validateAllianceSimbriefPlan(booking, { briefing: { flightNumber: "001", airline: "QTR", aircraftIcao: "A35K" } }));
});
