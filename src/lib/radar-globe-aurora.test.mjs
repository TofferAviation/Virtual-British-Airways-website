import assert from "node:assert/strict";
import test from "node:test";
import { auroraOval } from "./radar-globe-aurora.ts";

test("both auroral ovals retain NOAA geographic locations without pole rays", () => {
  const samples = [];
  for (let longitude = 0; longitude < 360; longitude++)
    for (const latitude of [68, 70, 72, -65, -67, -69])
      samples.push({
        longitude,
        latitude,
        probability: Math.abs(latitude) === 70 || latitude === -67 ? 80 : 30,
      });
  for (const hemisphere of [1, -1]) {
    const oval = auroraOval(samples, hemisphere);
    assert.equal(oval.length, 360);
    for (const point of oval) {
      assert.ok(Math.abs(point.latitude) < 85);
      assert.ok(
        Math.abs(point.latitude - (hemisphere === 1 ? 70 : -67)) < 1e-8,
      );
      assert.ok(point.strength > 0.75);
    }
  }
});
test("forecast remains continuous at 0/360 and negative longitudes", () => {
  const samples = Array.from({ length: 360 }, (_, i) => ({
    longitude: i > 180 ? i - 360 : i,
    latitude: 70 + Math.sin((i * Math.PI) / 180),
    probability: 60,
  }));
  const oval = auroraOval(samples, 1);
  assert.ok(Math.abs(oval[359].latitude - oval[0].latitude) < 0.03);
  assert.ok(Math.abs(oval[0].strength - 0.6) < 1e-8);
});
test("missing forecast data produces no invented auroral emission", () => {
  assert.ok(auroraOval([], 1).every((point) => point.strength === 0));
  assert.ok(
    auroraOval([{ longitude: 10, latitude: 90, probability: 95 }], 1).every(
      (point) => point.strength === 0,
    ),
  );
});
