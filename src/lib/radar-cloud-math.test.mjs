import assert from "node:assert/strict";
import test from "node:test";
import {
  cloudGridDimension,
  cloudPresentationHeight,
  decodeCloudHeight,
  encodeCloudHeight,
  isValidCloudColumn,
  resolveCloudRendererQuality,
} from "./radar-cloud-math.ts";

test("GFS cloud texture dimensions retain every grid edge", () => {
  assert.equal(cloudGridDimension(181, 1), 181);
  assert.equal(cloudGridDimension(181, 2), 91);
  assert.equal(cloudGridDimension(360, 3), 120);
  assert.equal(cloudGridDimension(721, 2), 361);
  assert.equal(cloudGridDimension(1440, 2), 720);
});

test("GFS cloud columns reject inverted, missing, and unrealistically thin layers", () => {
  assert.equal(isValidCloudColumn(75, 800, 2600), true);
  assert.equal(isValidCloudColumn(Number.NaN, 800, 2600), false);
  assert.equal(isValidCloudColumn(75, 2600, 800), false);
  assert.equal(isValidCloudColumn(75, 800, 900), false);
});

test("height packing clamps safely and stays within one texture quantisation step", () => {
  assert.equal(encodeCloudHeight(-50), 0);
  assert.equal(encodeCloudHeight(28_000), 255);
  const packed = encodeCloudHeight(1_234);
  assert.ok(Math.abs(decodeCloudHeight(packed) - 1_234) <= 50);
});

test("enhanced presentation preserves the model cloud base", () => {
  assert.equal(cloudPresentationHeight(1_000, 4_000, false), 4_000);
  assert.equal(cloudPresentationHeight(1_000, 4_000, true), 5_350);
});

test("automatic cloud quality does not mistake missing device-memory hints for a low-end desktop", () => {
  assert.equal(resolveCloudRendererQuality("auto", { mobile: true, cores: 12 }), "low");
  assert.equal(resolveCloudRendererQuality("auto", { mobile: false, memoryGb: 2, cores: 2 }), "low");
  assert.equal(resolveCloudRendererQuality("auto", { mobile: false, cores: 12 }), "high");
  assert.equal(resolveCloudRendererQuality("auto", { mobile: false, memoryGb: 8, cores: 8 }), "high");
  assert.equal(resolveCloudRendererQuality("auto", { mobile: false, memoryGb: 4, cores: 8 }), "medium");
  assert.equal(resolveCloudRendererQuality("ultra", { mobile: true, memoryGb: 2, cores: 2 }), "ultra");
});
