import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fixtureSchedule, loadTs, mutation, persisted, pilot, snapshot } from "./alliance-test-helpers.mjs";
const ledger = [persisted(mutation().entry)];
const Link = ({ href, children, ...rest }) => h("a", { ...rest, href }, children);
const shell = ({ title, intro, children }) => h("main", { className: "alliance-page" }, h("header", { className: "alliance-heading" }, h("span", null, "BA VIRTUAL · ALLIANCE OPERATIONS"), h("h1", null, title), h("p", null, intro)), h("nav", { className: "alliance-nav" }, ...["Route explorer", "My alliance career", "Career passport"].map((text, i) => h("a", { key: i, href: ["/oneworld/operations", "/account/alliance", "/account/alliance/passport"][i] }, text))), children);
const config = { settings: { enabled: true, policy: snapshot.policy }, carriers: [snapshot.operator], memberships: [] };
const mocks = {
  "next/link": Link, "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } },
  "@/components/AllianceShell": { AllianceShell: shell },
  "@/lib/pilot-auth": { requirePilotSession: async () => ({ pilotId: pilot.id }) },
  "@/lib/pilot-store": { getPilotById: async () => mutation().pilot },
  "@/lib/pilot-career": { listPilotQualifications: async () => [] },
  "@/lib/pilot-operations-store": { getActivePilotBooking: async () => null },
  "@/lib/alliance-store": { allianceReadiness: async () => ({ ready: true, ...config }), getAllianceConfiguration: async () => config, getAllianceSchedules: async () => [fixtureSchedule], listAllianceLedger: async id => { assert.equal(id, pilot.id); return ledger; }, getAllianceExportHistory: async () => [], getAllianceSalaryWithheld: async () => 0 },
};
const css = readFileSync(new URL("../app/alliance-operations.css", import.meta.url), "utf8");
const previewDir = new URL("../../.bav-data/alliance-ui-check/", import.meta.url);
function save(name, markup) {
  mkdirSync(previewDir, { recursive: true });
  writeFileSync(new URL(`${name}.html`, previewDir), `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Alliance screen check · test fixture</title><style>body{margin:0;font:16px/1.5 Arial,sans-serif;color:#17334a;background:#f7f9fb}button,.button{font:inherit;padding:10px 18px;border:1px solid #315d80;border-radius:3px;background:white;color:#153b59;text-decoration:none;display:inline-block}.button-primary{background:#123856;color:white}a{color:#164f79}small{font-size:.8rem}${css}</style></head><body><div style="background:#082b48;color:white;padding:10px 24px">LOCAL LAYOUT CHECK · clearly labelled test fixture · no real timetable</div>${markup}</body></html>`);
}
test("route explorer renders real page component with provenance, operator and booking controls", async () => {
  const page = loadTs("../app/oneworld/operations/page.tsx", { ...mocks, "./actions": { bookAlliance: "/fixture-only" } }).default;
  const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ date: "2026-11-06" }) }));
  assert.match(html, /Qatar Airways/); assert.match(html, /virtual route/); assert.match(html, /Route and callsign source/); assert.match(html, /Select and dispatch/);
  assert.match(html, /<input[^>]*type="time"[^>]*required[^>]*name="departure"/); assert.match(html, /name="aircraft" required/);
  assert.doesNotMatch(html, /Departs after|Departs before|Estimated airline bank|08:00–14:25/); save("routes", html);
});
test("career page uses the same approved ledger and does not add bank hours to lifetime time", async () => {
  const page = loadTs("../app/account/alliance/page.tsx", mocks).default;
  const html = renderToStaticMarkup(await page());
  assert.match(html, /256h 25m/); assert.doesNotMatch(html, /262h 50m/); assert.match(html, /6h 25m/); assert.match(html, /Verified PIREP/); assert.match(html, /consent/); save("career", html);
});
test("carrier profile and passport expose approved experience without issuing qualifications", async () => {
  const page = loadTs("../app/account/alliance/[carrierId]/page.tsx", mocks).default;
  const html = renderToStaticMarkup(await page({ params: Promise.resolve({ carrierId: "QR" }) }));
  assert.match(html, /6h 25m/); assert.match(html, /Airbus A350-1000/); save("bank", html);
  const passport = loadTs("../app/account/alliance/passport/page.tsx", mocks).default;
  const passportHtml = renderToStaticMarkup(await passport()); assert.match(passportHtml, /Qatar Airways/); assert.match(passportHtml, /No formal career qualifications/); save("passport", passportHtml);
});
test("missing migration renders a useful setup message instead of a server error", async () => {
  const page = loadTs("../app/account/alliance/page.tsx", { ...mocks, "@/lib/alliance-store": { allianceReadiness: async () => ({ ready: false }) } }).default;
  assert.match(renderToStaticMarkup(await page()), /awaiting database setup/);
});
