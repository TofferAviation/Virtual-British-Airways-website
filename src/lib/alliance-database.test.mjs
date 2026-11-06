import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, beforeEach, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { pilot, pirep, snapshot, fixtureSchedule, mutation, persisted, prepareAllianceCredit, rewards } from "./alliance-test-helpers.mjs";

const db = new PGlite();
const migration = name => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
const allianceSql = migration("20261106090000_alliance_operations.sql");
before(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  for (const name of ["20260912100000_acars_persistence.sql", "20260912120000_pilot_state_persistence.sql", "20260919090000_schedule_flexibility_rewards.sql", "20260927090000_pilot_career_finance_qualifications.sql"]) await db.exec(migration(name));
  await db.exec(allianceSql);
  await db.exec(migration("20261106091000_finance_rpc_column_qualification.sql"));
});
after(async () => db.close());
async function seedBooking(id = pirep.bookingId, schedule = fixtureSchedule) {
  const book = { id, pilotId: pilot.id, routeId: `alliance:${schedule.id}`, date: "2026-11-06", flightNumber: schedule.operatingFlightNumber, callsign: schedule.callsign, from: schedule.origin, to: schedule.destination, aircraft: schedule.aircraft, fleetAircraftId: null, registration: null, status: "booked", alliance: { ...snapshot, schedule } };
  const plan = { id: "33333333-3333-4333-8333-333333333333", bookingId: id, pilotId: pilot.id, status: "draft" };
  const { rows } = await db.query("select bav_alliance_book($1,$2,$3,$4) as id", [pilot.id, JSON.stringify(book), JSON.stringify(plan), JSON.stringify({ ...snapshot, schedule })]);
  return rows[0].id;
}
async function insertReport(report = pirep) {
  await db.query(`insert into pilot_pireps(id,pilot_id,booking_id,alliance_booking_id,flight_number,departure_station,arrival_station,aircraft,started_at,completed_at,block_minutes,distance_nm,status,source,simulator)
  values($1,$2,$3::text,($3::text)::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [report.id, report.pilotId, report.bookingId, report.flightNumber, report.from, report.to, report.aircraft, report.startedAt, report.completedAt, report.blockMinutes, report.distanceNm, report.status, report.source, report.simulator]);
}
async function readPilot() { return (await db.query("select state->'pilots'->0 as pilot from pilot_state where singleton")).rows[0].pilot; }
async function review(m, decision = "accepted", expected = pilot, source = pirep, revision = 0) {
  const { rows } = await db.query("select * from bav_alliance_review($1,$2,$3,$4,$5,$6,$7,$8,$9)", [source.id, source.status, JSON.stringify(expected), JSON.stringify(m.pilot), revision, m.entry ? JSON.stringify(m.entry) : null, decision, "test-staff", "Test fixture review"]);
  return rows[0];
}
beforeEach(async () => {
  await db.exec("truncate pilot_state,pilot_pireps,alliance_bookings,alliance_credit_ledger,pilot_finance_transactions,pilot_finance_accounts,alliance_audit,alliance_salary_withholdings,alliance_salary_adjustments restart identity cascade;");
  await db.query("insert into pilot_state(singleton,state) values(true,$1)", [JSON.stringify({ version: 12, pilots: [pilot], operationsState: { version: 5, bookings: [], flightPlans: [], pireps: [] } })]);
  await db.query("update alliance_settings set enabled=true,policy=$1 where singleton", [JSON.stringify(snapshot.policy)]);
  await db.query("update alliance_carriers set enabled=true");
  await db.query("update alliance_memberships set eligible=true,valid_until=null");
  await db.query("insert into alliance_schedules(id,operator_id,marketing_carrier_id,data,updated_by) values($1,'QR','QR',$2,'test') on conflict(id) do update set data=excluded.data", [fixtureSchedule.id, JSON.stringify(fixtureSchedule)]);
  await seedBooking(); await insertReport();
});

test("actual PostgreSQL approval atomically credits career, airline ledger, source report and salary", async () => {
  const m = mutation(); await review(m);
  const account = await readPilot(); assert.equal(Math.round(account.hours * 3600), 923100); assert.equal(account.flights, 11);
  const bank = (await db.query("select * from alliance_airline_banks")).rows[0]; assert.equal(Number(bank.seconds), 23100); assert.equal(Number(bank.sectors), 1);
  assert.equal((await db.query("select status from pilot_pireps")).rows[0].status, "accepted");
  assert.equal(Number((await db.query("select current_balance from pilot_finance_accounts")).rows[0].current_balance), 300);
  assert.equal(Number((await db.query("select count(*) as n from alliance_audit where action='pirep.accepted'")).rows[0].n), 1);
});
test("concurrent duplicate approvals and subsequent replay post once", async () => {
  const m = mutation(); await Promise.all([review(m), review(m)]); await review(m);
  assert.equal((await readPilot()).flights, 11);
  assert.equal(Number((await db.query("select count(*) n from alliance_credit_ledger")).rows[0].n), 1);
  assert.equal(Number((await db.query("select count(*) n from pilot_finance_transactions")).rows[0].n), 1);
});
test("different concurrent approvals protect the pilot total and succeed after a fresh retry", async () => {
  await db.query("update pilot_state set state=jsonb_set(state,'{operationsState,bookings,0,status}','\"completed\"') where singleton");
  const other = { ...pirep, id: "77777777-7777-4777-8777-777777777777", bookingId: "88888888-8888-4888-8888-888888888888" };
  await seedBooking(other.bookingId); await insertReport(other);
  const first = mutation(), second = mutation({ pirep: other });
  const attempts = await Promise.allSettled([review(first), review(second, "accepted", pilot, other)]);
  assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1);
  const lost = attempts[0].status === "rejected" ? pirep : other, fresh = await readPilot();
  await review(mutation({ pilot: fresh, pirep: lost }), "accepted", fresh, lost);
  assert.equal((await readPilot()).flights, 12); assert.equal(Math.round((await readPilot()).hours * 3600), 946200);
});
test("a later ineligible membership period blocks a still-overlapping older eligible period", async () => {
  await db.query("insert into alliance_memberships(carrier_id,valid_from,eligible,kind,source_url) values('QR','2026-11-07',false,'member','https://example.org/test-fixture')");
  const changed = { ...fixtureSchedule, id: "test-fixture-qr-future" };
  await db.query("insert into alliance_schedules(id,operator_id,marketing_carrier_id,data,updated_by) values($1,'QR','QR',$2,'test')", [changed.id, JSON.stringify(changed)]);
  const booking = { id: "99999999-9999-4999-8999-999999999999", pilotId: pilot.id, routeId: `alliance:${changed.id}`, date: "2026-11-07", flightNumber: "QR1", callsign: "QTR1", from: "OTHH", to: "EGLL", aircraft: changed.aircraft, status: "booked", fleetAircraftId: null };
  await assert.rejects(db.query("select bav_alliance_book($1,$2,$3,$4)", [pilot.id, JSON.stringify(booking), JSON.stringify({ bookingId: booking.id, pilotId: pilot.id }), JSON.stringify({ ...snapshot, schedule: changed })]), /not eligible/);
  await db.query("delete from alliance_memberships where carrier_id='QR' and valid_from='2026-11-07'");
});
test("rejection and request-for-changes do not create credit", async () => {
  const m = mutation({ review: { decision: "changes_requested", actor: "staff", reason: "Needs evidence", expectedRevision: 0 } });
  await review(m, "changes_requested");
  const second = mutation({ pirep: { ...pirep, status: "changes_requested" }, review: { decision: "rejected", actor: "staff", reason: "Evidence insufficient", expectedRevision: 0 } });
  await review(second, "rejected", pilot, { ...pirep, status: "changes_requested" });
  assert.equal((await readPilot()).hours, 250); assert.equal((await db.query("select * from alliance_credit_ledger")).rows.length, 0);
});
test("reversal is atomic, idempotent and preserves history even after virtual salary was spent", async () => {
  const first = mutation(); await review(first);
  await db.query("select * from bav_post_finance_transaction($1,'test-spend','training_payment',-250,'Test fixture purchase')", [pilot.id]);
  const reversed = mutation({ pilot: first.pilot, pirep: { ...pirep, status: "accepted" }, history: [persisted(first.entry)], review: { decision: "reverse", actor: "staff", reason: "Invalidated flight", expectedRevision: 1 } });
  await review(reversed, "reverse", first.pilot, { ...pirep, status: "accepted" }, 1);
  await review(reversed, "reverse", first.pilot, { ...pirep, status: "accepted" }, 1);
  assert.equal((await readPilot()).hours, 250); assert.equal((await readPilot()).flights, 10);
  const bank = (await db.query("select * from alliance_airline_banks")).rows[0]; assert.equal(Number(bank.seconds), 0);
  assert.equal(Number((await db.query("select current_balance from pilot_finance_accounts")).rows[0].current_balance), 0);
  assert.equal(Number((await db.query("select remaining from alliance_salary_withholdings")).rows[0].remaining), 250);
  await assert.rejects(db.query("update pilot_finance_accounts set current_balance=-1"), /check constraint/);
  assert.equal((await db.query("select * from alliance_credit_ledger")).rows.length, 2);
  await assert.rejects(db.exec("delete from alliance_credit_ledger"), /immutable/);
});
test("time correction synchronizes standard report, airline bank, career and virtual rewards", async () => {
  const first = mutation(); await review(first);
  const corrected = mutation({ pilot: first.pilot, pirep: { ...pirep, status: "accepted" }, history: [persisted(first.entry)], review: { decision: "adjust", actor: "staff", reason: "Correct validated block", expectedRevision: 1, seconds: 24001 } });
  await review(corrected, "adjust", first.pilot, { ...pirep, status: "accepted" }, 1);
  assert.equal(Number((await db.query("select seconds from alliance_airline_banks")).rows[0].seconds), 24001);
  assert.equal(Math.round(Number((await db.query("select block_minutes from pilot_pireps")).rows[0].block_minutes) * 60), 24001);
  assert.equal((await readPilot()).flights, 11);
  await assert.rejects(review(corrected, "adjust", first.pilot, { ...pirep, status: "accepted" }, 1), /ALLIANCE_CONFLICT/);
});
test("future alliance salary settles withheld reversed pay without overdrawing the finance account", async () => {
  const first = mutation(); await review(first);
  await db.query("select * from bav_post_finance_transaction($1,'test-spend','training_payment',-250,'Test fixture purchase')", [pilot.id]);
  const reversed = mutation({ pilot: first.pilot, pirep: { ...pirep, status: "accepted" }, history: [persisted(first.entry)], review: { decision: "reverse", actor: "staff", reason: "Invalidated flight", expectedRevision: 1 } });
  await review(reversed, "reverse", first.pilot, { ...pirep, status: "accepted" }, 1);
  await db.query("update pilot_state set state=jsonb_set(state,'{operationsState,bookings,0,status}','\"completed\"') where singleton");
  const other = { ...pirep, id: "77777777-7777-4777-8777-777777777777", bookingId: "88888888-8888-4888-8888-888888888888" };
  await seedBooking(other.bookingId); await insertReport(other); const fresh = await readPilot();
  await review(mutation({ pilot: fresh, pirep: other }), "accepted", fresh, other);
  assert.equal(Number((await db.query("select current_balance from pilot_finance_accounts")).rows[0].current_balance), 50);
  assert.equal(Number((await db.query("select remaining from alliance_salary_withholdings")).rows[0].remaining), 0);
  assert.equal(Number((await db.query("select sum(amount) total from pilot_finance_transactions")).rows[0].total), 50);
});
test("stale pilot snapshot rolls back every side effect and a fresh retry succeeds", async () => {
  await db.query("update pilot_state set state=jsonb_set(state,'{pilots,0,points}','101') where singleton");
  await assert.rejects(review(mutation()), /ALLIANCE_CONFLICT/);
  assert.equal((await db.query("select * from alliance_credit_ledger")).rows.length, 0); assert.equal((await db.query("select status from pilot_pireps")).rows[0].status, "pending");
  const fresh = await readPilot(); await review(mutation({ pilot: fresh }), "accepted", fresh);
  assert.equal((await readPilot()).points, 201);
});
test("historic totals survive migration and idempotent reapplication without guessed bank entries", async () => {
  const initial = await readPilot(); await db.exec(allianceSql); assert.deepEqual(await readPilot(), initial);
  assert.equal((await db.query("select * from alliance_credit_ledger")).rows.length, 0);
  assert.equal((await db.query("select * from alliance_carriers")).rows.length, 16);
});
test("membership changes leave earned credit intact and block new bookings", async () => {
  await review(mutation());
  await db.query("update alliance_memberships set valid_until='2026-11-05',valid_from='2026-01-01' where carrier_id='QR'");
  await db.query("update pilot_state set state=jsonb_set(state,'{operationsState,bookings,0,status}','\"completed\"') where singleton");
  await assert.rejects(seedBooking("44444444-4444-4444-8444-444444444444"), /not eligible/);
  assert.equal(Number((await db.query("select seconds from alliance_airline_banks")).rows[0].seconds), 23100);
});
test("same booking cannot submit a second report; cancelled flights cannot earn credit", async () => {
  await assert.rejects(insertReport({ ...pirep, id: "55555555-5555-4555-8555-555555555555" }), /unique|duplicate/);
  await db.query("update pilot_state set state=jsonb_set(state,'{operationsState,bookings,0,status}','\"cancelled\"') where singleton");
  await assert.rejects(review(mutation()), /Cancelled/); assert.equal((await readPilot()).hours, 250);
});
test("missing alliance booking metadata holds the report instead of awarding BA credit", async () => {
  await db.query("update pilot_pireps set booking_id='66666666-6666-4666-8666-666666666666'");
  await assert.rejects(review(mutation()), /metadata missing/); assert.equal((await readPilot()).hours, 250);
});
test("anonymous and pilot roles cannot call credit RPCs or read other pilots' banks", async () => {
  await db.exec("set role anon");
  try { await assert.rejects(db.query("select * from alliance_credit_ledger"), /permission denied/); await assert.rejects(db.query("select bav_alliance_admin('settings','fake','{}')"), /permission denied/); await assert.rejects(db.query("select * from bav_post_finance_transaction('forged','test','bonus',100,'Fake credit')"), /permission denied/); }
  finally { await db.exec("reset role"); }
  await db.exec("set role authenticated");
  try { await assert.rejects(db.query("select * from alliance_airline_banks"), /permission denied/); }
  finally { await db.exec("reset role"); }
});
test("compare-and-swap rejects stale full-document writes that could erase new credit", async () => {
  const expected = (await db.query("select state from pilot_state")).rows[0].state;
  await review(mutation());
  const result = await db.query("select bav_compare_swap_pilot_state($1,$2) ok", [JSON.stringify(expected), JSON.stringify(expected)]);
  assert.equal(result.rows[0].ok, false); assert.equal((await readPilot()).flights, 11);
});
test("service role can read configuration but cannot edit ledger rows directly", async () => {
  await db.exec("set role service_role");
  try {
    assert.equal((await db.query("select * from alliance_settings")).rows.length, 1);
    await assert.rejects(db.query("update alliance_credit_ledger set seconds=0"), /permission denied/);
  } finally { await db.exec("reset role"); }
});
