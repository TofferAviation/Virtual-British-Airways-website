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

function service({ status, rpcError, lookupError } = {}) {
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
    ? { createClient: () => client } : { BAV_NETWORK_ICAO_BY_IATA: {} }, exports, { env });
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
