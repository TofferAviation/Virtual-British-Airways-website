import assert from "node:assert/strict";
import test from "node:test";
import { periodicGradientNoise, periodicCellularNoise, bakeCloudNoise } from "./radar-cloud-noise.ts";

test("gradient and cellular volumes join across every wrapped axis", () => {
  for (const sample of [periodicGradientNoise, periodicCellularNoise])
    for (const period of [3, 4, 8, 12])
      for (const point of [[0.17, 1.24, 2.45], [-0.38, 0.07, -1.2]]) {
        const baseline = sample(...point, period);
        for (let axis = 0; axis < 3; axis++) {
          const shifted = [...point];
          shifted[axis] += period;
          assert.ok(Math.abs(sample(...shifted, period) - baseline) < 1e-12);
        }
      }
});

test("RGBA baking is deterministic and retains independent mass/erosion signals", () => {
  const size = 16;
  const a = bakeCloudNoise(size), b = bakeCloudNoise(size);
  assert.equal(a.length, size ** 3 * 4);
  assert.deepEqual(a, b);
  const channels = Array.from({ length: 4 }, (_, c) => Array.from({ length: size ** 3 }, (_, i) => a[i * 4 + c]));
  for (const values of channels) {
    assert.ok(Math.max(...values) - Math.min(...values) > 60);
    assert.ok(values.every(value => value >= 0 && value <= 255));
  }
  assert.notDeepEqual(channels[0], channels[1]);
  assert.notDeepEqual(channels[1], channels[2]);
  assert.notDeepEqual(a, bakeCloudNoise(size, true));
});

test("height changes alter the actual volume, not just an extruded 2D column", () => {
  const data = bakeCloudNoise(16);
  let changed = 0;
  for (let z = 0; z < 16; z++)
    for (let x = 0; x < 16; x++)
      if (Math.abs(data[((z * 16 + 2) * 16 + x) * 4] - data[((z * 16 + 10) * 16 + x) * 4]) > 10) changed++;
  assert.ok(changed > 100);
});
