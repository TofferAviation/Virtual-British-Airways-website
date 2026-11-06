import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function compile(path, modules = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", code)((name) => modules[name] ?? {}, exports);
  return exports;
}
const messages = compile("./fleet-reservation-errors.ts");
test("reservation failures retain their cause rather than blaming another pilot", () => {
  for (const [message, status, expected] of [
    ["You already have an aircraft operating. Complete that flight before selecting another registration.", 400, "registration-active-flight"],
    ["Active organization membership is required.", 403, "registration-access"],
    ["This registration is unavailable for selection.", 400, "registration-unavailable"],
    ["Fleet offline", 503, "registration-service"],
    ["Unexpected validation error", 400, "registration-failed"],
  ]) {
    assert.equal(messages.registrationFailureCode({ message, status }), expected);
    assert.ok(messages.registrationErrorMessage(expected));
    assert.doesNotMatch(messages.registrationErrorMessage(expected), /Another pilot selected it first/);
  }
  assert.equal(messages.registrationErrorMessage("arbitrary-error"), null);
});

async function reserve({ stale = false, foreignBooking = false, invalidAircraft = false } = {}) {
  class FleetServiceError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const writes = [];
  const booking = { id: "saved-booking", status: "booked", flightNumber: "BA288", from: "PHX", to: "LHR" };
  const action = compile("../app/flight-plans/[bookingId]/actions.ts", {
    "next/navigation": { redirect(path) { throw Object.assign(new Error("NEXT_REDIRECT"), { path }); } },
    "@/lib/pilot-auth": { requirePilotSession: async () => ({ pilotId: "pilot", name: "Pilot" }) },
    "@/lib/pilot-operations-store": {
      getActivePilotBooking: async () => booking,
      setPilotBookingFleetSelection: async (selection) => writes.push(["selection", selection]),
    },
    "@/lib/fleet-pilot-auth": { requireFleetPilotAircraftForActiveBooking: async (actor, aircraftId) => {
      assert.equal(actor.pilotId, "pilot"); assert.equal(aircraftId, "aircraft");
      if (invalidAircraft) throw new FleetServiceError("This assignment requires a matching aircraft.", 409);
      return { aircraft: { id: "aircraft", registration: "G-TEST" } };
    } },
    "@/lib/fleet-reservation-errors": messages,
    "@/lib/fleet-service": {
      FleetServiceError,
      ensureFleetMembership: async () => {},
      reserveFleetAircraftForFlight: async (id, actor, flight) => {
        if (stale) throw new FleetServiceError("You already have an aircraft operating.");
        writes.push(["reservation", { id, actor, flight }]);
      },
    },
  });
  const form = new FormData(); form.set("bookingId", foreignBooking ? "another-booking" : booking.id); form.set("fleetAircraftId", "aircraft");
  let path;
  try { await action.reserveBookingAircraft(form); } catch (error) { if (!error.path) throw error; path = error.path; }
  return { path, writes };
}
test("retry attaches the registration to the saved flight without recreating its booking or briefing", async () => {
  const result = await reserve();
  assert.equal(result.path, "/flight-plans/saved-booking?registrationReserved=1");
  assert.deepEqual(result.writes.map(([kind]) => kind), ["reservation", "selection"]);
  assert.equal(result.writes[1][1].bookingId, "saved-booking");
});
test("another booking cannot be changed through a forged retry form", async () => {
  assert.deepEqual(await reserve({ foreignBooking: true }), { path: "/manage-assignment", writes: [] });
});
test("a stale operation or invalid aircraft leaves the saved booking untouched", async () => {
  const stale = await reserve({ stale: true });
  assert.equal(stale.path, "/flight-plans/saved-booking?error=registration-active-flight");
  assert.deepEqual(stale.writes, []);
  const invalid = await reserve({ invalidAircraft: true });
  assert.deepEqual(invalid.writes, []);
});
