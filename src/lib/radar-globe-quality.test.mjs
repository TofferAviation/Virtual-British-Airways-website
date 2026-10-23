import assert from "node:assert/strict";
import test from "node:test";
import { AdaptiveGlobeQuality, GLOBE_PROFILES, globeRenderSize, initialGlobeQuality, refineGlobeTile } from "./radar-globe-quality.ts";

test("unknown hardware is conservative; low memory and data saver get a bounded profile", () => {
  assert.equal(initialGlobeQuality({}), "medium");
  assert.equal(initialGlobeQuality({ memoryGb: 4, cores: 16 }), "low");
  assert.equal(initialGlobeQuality({ memoryGb: 8, cores: 8 }), "medium");
  assert.equal(initialGlobeQuality({ memoryGb: 8, cores: 8, saveData: true }), "low");
});
test("4K/high-DPI sizes respect independent ground/cloud pixel budgets", () => {
  for (const quality of Object.keys(GLOBE_PROFILES)) {
    const p = GLOBE_PROFILES[quality], s = globeRenderSize(3840, 2160, 3, quality);
    assert.ok(s.groundWidth * s.groundHeight <= p.groundPixels);
    assert.ok(s.cloudWidth * s.cloudHeight <= p.cloudPixels);
    assert.ok(s.cloudWidth < s.groundWidth);
    assert.ok(s.ratio <= p.pixelRatio);
  }
  const low = globeRenderSize(1920, 1080, 1, "low");
  assert.equal(low.groundWidth, 1920); // terrain remains native 1080p
  assert.ok(low.cloudWidth * low.cloudHeight < 1920 * 1080 / 4);
  assert.ok(globeRenderSize(0, 0, 1, "low").cloudWidth >= 1);
});
test("Auto ignores one-off stalls and manual modes, then downshifts sustained overload", () => {
  const a = new AdaptiveGlobeQuality({ memoryGb: 8, cores: 8 });
  a.reset(0);
  for (let t = 0; t < 10000; t += 33) a.sample(200, t, false);
  assert.equal(a.quality, "medium");
  for (let t = 10000; t < 12000; t += 33) a.sample(t === 10000 ? 190 : 10, t, true);
  assert.equal(a.quality, "medium");
  for (let t = 12000; t < 26000; t += 33) a.sample(100, t, true);
  assert.equal(a.quality, "low");
});
test("Auto has slow recovery, never promotes itself to Ultra and cannot thrash", () => {
  const a = new AdaptiveGlobeQuality({});
  a.reset(0);
  for (let t = 0; t < 14000; t += 33) a.sample(100, t, true);
  assert.equal(a.quality, "low");
  for (let t = 14000; t < 100000; t += 33) a.sample(3, t, true);
  assert.equal(a.quality, "high");
});
test("Auto respects low-memory ceilings and reacts even when GPU work exceeds half a second", () => {
  const low = new AdaptiveGlobeQuality({ memoryGb: 4, cores: 8 });
  for (let t = 0; t < 100000; t += 33) low.sample(1, t, true);
  assert.equal(low.quality, "low");
  const slow = new AdaptiveGlobeQuality({ memoryGb: 8, cores: 8 });
  for (let t = 0; t < 40000; t += 1000) slow.sample(900, t, true);
  assert.equal(slow.quality, "low");
});
test("tile split/merge hysteresis does not bounce at the target", () => {
  assert.equal(refineGlobeTile(500, false, 500), false);
  assert.equal(refineGlobeTile(500, true, 500), true);
  assert.equal(refineGlobeTile(380, true, 500), false);
  assert.equal(refineGlobeTile(570, false, 500), true);
});
