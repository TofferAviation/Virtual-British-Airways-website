import assert from "node:assert/strict";
import test from "node:test";
import {
  cloudGridDimension,
  cloudPresentationHeight,
  decodeCloudHeight,
  encodeCloudHeight,
  isValidCloudColumn,
} from "./radar-cloud-math.ts";

test("GFS cloud texture dimensions retain every grid edge", () => {
  assert.equal(cloudGridDimension(181, 1), 181);
  assert.equal(cloudGridDimension(181, 2), 91);
  assert.equal(cloudGridDimension(360, 3), 120);
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
