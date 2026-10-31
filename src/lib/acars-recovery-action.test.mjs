import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../app/account/acars-recovery/actions.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function run({ existingReport, failSubmission } = {}) {
  let submissions = 0;
  const session = { id: "session", pilotId: "pilot", distanceNm: 5811, lastSnapshot: {}, status: "completed", completedAt: "2026-10-28T15:10:00Z" };
  const exports = {};
  const modules = {
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect(path) { throw Object.assign(new Error("NEXT_REDIRECT"), { path }); } },
    "@/lib/pilot-auth": { requirePilotSession: async () => ({ pilotId: "pilot" }) },
    "@/lib/acars-store": { getAcarsSession: async () => session },
    "@/lib/pilot-operations-store": { getPirepForAcarsSession: async () => existingReport ? { id: "saved" } : null },
    "@/lib/acars-pirep": { submitAcarsPirep: async () => {
      submissions++;
      if (failSubmission) throw new Error("Database unavailable");
      return { pirep: { id: "recovered" } };
    } },
  };
  new Function("require", "exports", code)((name) => modules[name], exports);
  const form = new FormData(); form.set("sessionId", "session");
  let path;
  try { await exports.recoverAcarsFlightAction(form); } catch (error) {
    if (!error.path) throw error;
    path = error.path;
  }
  return { path, submissions };
}
test("successful recovery opens the report rather than catching its navigation as an error", async () => {
  assert.deepEqual(await run(), { path: "/account/flights/recovered?recovered=1", submissions: 1 });
});
test("repeated recovery opens the saved report without submitting a duplicate", async () => {
  assert.deepEqual(await run({ existingReport: true }), { path: "/account/flights/saved", submissions: 0 });
});
test("a failed submission retains the recovery error page", async () => {
  assert.deepEqual(await run({ failSubmission: true }), { path: "/account/acars-recovery?error=submit", submissions: 1 });
});
