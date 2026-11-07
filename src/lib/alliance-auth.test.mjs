import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs, pilot, persisted, mutation, snapshot } from "./alliance-test-helpers.mjs";
const navigation = { redirect(path) { throw Object.assign(new Error("REDIRECT"), { path }); } };
test("booking ignores forged pilot identity and uses the authenticated session", async () => {
  let seen;
  const { bookAlliance } = loadTs("../app/oneworld/operations/actions.ts", {
    "next/navigation": navigation, "@/lib/pilot-auth": { requirePilotSession: async () => ({ pilotId: pilot.id }) },
    "@/lib/alliance-store": { bookAllianceFlight: async (...args) => { seen = args; return "booking"; } },
  });
  const form = new FormData(); form.set("pilotId", "foreign-pilot"); form.set("scheduleId", "schedule"); form.set("date", "2026-11-06"); form.set("aircraft", "Boeing 787-9"); form.set("departure", "23:55");
  await assert.rejects(bookAlliance(form), e => e.path === "/flight-plans/booking"); assert.equal(seen[0], pilot.id);
  assert.deepEqual(seen[3], { aircraft: "Boeing 787-9", departure: "23:55" });
});
test("staff configuration and report credit refuse an unauthorized caller before any write", async () => {
  let writes = 0;
  const actions = loadTs("../app/staff/alliance/actions.ts", { "next/cache": {}, "next/navigation": navigation, "@/lib/staff-auth": { requireStaffPermission: async () => { throw new Error("DENIED"); } }, "@/lib/alliance-store": { allianceAdminChange: async () => writes++, reviewAlliancePirep: async () => writes++ }, "@/lib/pilot-operations-store": {} });
  for (const action of [actions.updateAlliance, actions.reviewAlliance]) await assert.rejects(action(new FormData()), /DENIED/);
  assert.equal(writes, 0);
});

test("partner aircraft menu changes only unstarted, owned flights and preserves Realistic qualification checks", async () => {
  let booking = { id: "booking", pilotId: pilot.id, status: "booked", aircraft: "Airbus A350-1000", alliance: snapshot }, written = [], qualified = true, checks = 0;
  const { changeBookingAircraft } = loadTs("../app/flight-plans/[bookingId]/actions.ts", {
    "next/navigation": navigation, "@/lib/pilot-auth": { requirePilotSession: async () => ({ pilotId: pilot.id }) },
    "@/lib/pilot-operations-store": { getPilotBooking: async (id, owner) => { assert.equal(owner, pilot.id); return booking; }, updatePilotBookingAircraft: async input => written.push(input) },
    "@/lib/pilot-store": { getPilotById: async () => pilot }, "@/lib/pilot-ranks": {},
    "@/lib/pilot-career": { checkAircraftCareerEligibility: async () => { checks++; return { eligible: qualified }; } },
    "@/lib/route-store": { getBookableRoute: async () => null }, "@/lib/simbrief": {},
    "@/lib/fleet-service": {}, "@/lib/fleet-pilot-auth": {}, "@/lib/fleet-reservation-errors": {},
  });
  const form = new FormData(); form.set("bookingId", "booking"); form.set("pilotId", "foreign"); form.set("aircraft", "Boeing 787-9");
  await assert.rejects(changeBookingAircraft(form), e => e.path.endsWith("aircraftUpdated=1"));
  assert.deepEqual(written, [{ bookingId: "booking", pilotId: pilot.id, aircraft: "Boeing 787-9" }]); assert.equal(checks, 0);
  written = []; booking = { ...booking, status: "in_progress" };
  await assert.rejects(changeBookingAircraft(form), e => e.path.endsWith("aircraft-started"));
  booking = { ...booking, status: "booked", alliance: { ...snapshot, mode: "realistic_operations" } }; qualified = false;
  await assert.rejects(changeBookingAircraft(form), e => e.path.endsWith("aircraft-qualification"));
  assert.equal(checks, 1); assert.equal(written.length, 0);
  form.set("aircraft", "constructor");
  await assert.rejects(changeBookingAircraft(form), e => e.path.endsWith("aircraft-change"));
  assert.equal(written.length, 0);
});
test("exports require explicit consent and always scope data to the authenticated pilot", async () => {
  let audited = 0, requested;
  const { POST } = loadTs("../app/api/pilot/alliance/export/route.ts", { "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } }, "@/lib/pilot-auth": { requirePilotSession: async () => ({ pilotId: pilot.id }) }, "@/lib/alliance-store": { listAllianceLedger: async id => { requested = id; return [persisted(mutation().entry)]; }, allianceExportAudit: async id => { assert.equal(id, pilot.id); audited++; } } });
  const denied = new FormData(); denied.set("format", "json"); assert.equal((await POST(new Request("https://example.invalid/export", { method: "POST", body: denied }))).status, 400);
  assert.equal(audited, 0);
  const allowed = new FormData(); allowed.set("format", "json"); allowed.set("consent", "yes"); allowed.set("pilotId", "another-pilot");
  const response = await POST(new Request("https://example.invalid/export", { method: "POST", body: allowed }));
  assert.equal(requested, pilot.id); assert.equal(audited, 1); assert.match(response.headers.get("cache-control"), /no-store/);
  const payload = await response.json(); assert.equal(payload.banks[0].seconds, 23100); assert.equal(payload.externalSync, "disabled"); assert.equal(payload.entries[0].pirepId, "11111111-1111-4111-8111-111111111111"); assert.equal(payload.entries[0].actor, undefined);
});
