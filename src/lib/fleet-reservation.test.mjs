import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("./fleet-service.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const aircraftId = "11111111-1111-1111-1111-111111111111";
const actor = { subject: "bav:pilot", displayName: "Pilot", fleetRole: "pilot" };
const input = { pilotSubject: actor.subject, flightReference: "BA285" };

function service({ status, rpcError, lookupError, clientOverride } = {}) {
  const filters = [];
  const client = {
    rpc: async () => ({ data: { status: "cancelled" }, error: rpcError ?? null }),
    from(table) {
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        in() { return query; }, order() { return query; }, limit() { return query; },
        async maybeSingle() {
          return table === "organizations" ? { data: { id: "org" } }
            : { data: status ? { status } : null, error: lookupError ?? null };
        },
      };
      return query;
    },
  };
  const exports = {};
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://test.invalid", SUPABASE_SECRET_KEY: "test-only" };
  new Function("require", "exports", "process", code)((name) => name === "@supabase/supabase-js"
    ? { createClient: () => clientOverride ?? client } : { BAV_NETWORK_ICAO_BY_IATA: {} }, exports, { env });
  return { ...exports, filters };
}
const noReservation = { message: "Only a reservation that has not started can be released." };

test("a reserved aircraft is released normally", async () => {
  const api = service();
  assert.equal((await api.cancelFleetAircraftReservation(aircraftId, actor, input)).status, "cancelled");
});
for (const status of [undefined, "completed"]) {
  test(`a ${status ?? "missing/cancelled"} reservation does not prevent the next booking`, async () => {
    const api = service({ status, rpcError: noReservation });
    assert.equal(await api.cancelFleetAircraftReservation(aircraftId, actor, input), null);
    for (const filter of [["aircraft_id", aircraftId], ["pilot_subject", "BAV:PILOT"], ["flight_reference", "BA285"]]) {
      assert.ok(api.filters.some(([key, value]) => key === filter[0] && value === filter[1]));
    }
  });
}
test("an operating flight remains protected even when the website says booked", async () => {
  const api = service({ status: "operating", rpcError: noReservation });
  await assert.rejects(api.cancelFleetAircraftReservation(aircraftId, actor, input), api.FleetReservationInProgressError);
});
test("a concurrent reservation and a failed verification are not treated as successful releases", async () => {
  for (const options of [{ status: "reserved" }, { lookupError: { message: "offline" } }]) {
    const api = service({ ...options, rpcError: noReservation });
    await assert.rejects(api.cancelFleetAircraftReservation(aircraftId, actor, input), api.FleetServiceError);
  }
});
test("permission failures cannot be bypassed as missing reservations", async () => {
  const api = service({ rpcError: { message: "Access denied", code: "42501" } });
  await assert.rejects(api.cancelFleetAircraftReservation(aircraftId, actor, input), (error) => error.status === 403);
});

function staleService({ missing = false, fresh = false, active = false, activeSession, auditFails = false, racing = false } = {}) {
  const writes = [], filters = [];
  const row = { id: "assignment", aircraft_id: aircraftId, pilot_subject: "BAV:PILOT", flight_reference: "BA12", status: "operating", updated_at: fresh ? new Date().toISOString() : "2026-01-01T00:00:00Z" };
  const client = { from(table) {
    let update;
    const result = () => ({ data: table === "organizations" ? { id: "org" }
      : table === "aircraft_flight_assignments" ? (missing || update && racing ? null : update ? { id: row.id } : row)
      : table === "aircraft" ? { id: aircraftId, status_version: 7, registration: "G-XLEJ" }
      : table === "acars_sessions" ? (activeSession ? [activeSession] : active ? [{ flight_number: "BA12", updated_at: new Date().toISOString() }] : []) : [], error: null });
    const query = {
      select() { return query; }, eq(key, value) { filters.push([table, key, value]); return query; }, in() { return query; },
      order() { return query; },
      update(value) { update = value; writes.push([table, value]); return query; },
      async insert(value) { writes.push([table, value]); return { error: auditFails ? { message: "Audit offline" } : null }; },
      async maybeSingle() { return result(); },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    }; return query;
  } };
  return { api: service({ clientOverride: client }), writes, filters };
}
const releaseInput = { aircraftId, assignmentId: "assignment", reason: "Pilot confirms the old BA12 flight has ended." };
test("stale release is scoped to its owner and exact assignment and preserves flight data", async () => {
  const { api, writes, filters } = staleService();
  await api.releaseOwnStaleFleetAssignment(actor, releaseInput);
  assert.deepEqual(writes.map(([table]) => table), ["fleet_audit_events", "aircraft_flight_assignments", "aircraft"]);
  assert.ok(filters.some(([table, key, value]) => table === "aircraft_flight_assignments" && key === "pilot_subject" && value === "BAV:PILOT"));
  assert.ok(filters.some(([table, key, value]) => table === "aircraft" && key === "status_version" && value === 7));
  assert.deepEqual(Object.keys(writes[1][1]).sort(), ["status", "updated_at"]);
  assert.equal(writes[2][1].current_station, undefined);
  assert.equal(writes[2][1].airframe_hours_minutes, undefined);
});
test("missing, recently changed and actively tracked assignments cannot be force released", async () => {
  for (const option of [{ missing: true }, { fresh: true }, { active: true }]) {
    const { api, writes } = staleService(option);
    await assert.rejects(api.releaseOwnStaleFleetAssignment(actor, releaseInput), api.FleetServiceError);
    assert.equal(writes.length, 0);
  }
});
test("audit failure and a concurrent assignment change stop stale release cleanup", async () => {
  for (const option of [{ auditFails: true }, { racing: true }]) {
    const { api, writes } = staleService(option);
    await assert.rejects(api.releaseOwnStaleFleetAssignment(actor, releaseInput), api.FleetServiceError);
    assert.ok(!writes.some(([table]) => table === "aircraft"));
    if (option.auditFails) assert.ok(!writes.some(([table]) => table === "aircraft_flight_assignments"));
  }
});
test("a new parked preflight does not protect an old lock, but fresh movement of that airframe does", async () => {
  const activeSession = { flight_number: "BA209", updated_at: new Date().toISOString(), last_snapshot: { registration: "G-XLEJ", onGround: true, groundSpeedKt: 0, flightStarted: false } };
  const parked = staleService({ activeSession });
  await parked.api.releaseOwnStaleFleetAssignment(actor, releaseInput);
  for (const change of [{ onGround: false }, { groundSpeedKt: 30 }, { flightStarted: true }]) {
    const moving = staleService({ activeSession: { ...activeSession, last_snapshot: { ...activeSession.last_snapshot, ...change } } });
    await assert.rejects(moving.api.releaseOwnStaleFleetAssignment(actor, releaseInput), moving.api.FleetServiceError);
    assert.equal(moving.writes.length, 0);
  }
});
