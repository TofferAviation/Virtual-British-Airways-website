import assert from "node:assert/strict";
import test from "node:test";
import {
  WGS84_A_KM,
  WGS84_B_KM,
  geodeticToWorld,
  worldToGeodetic,
  geodeticNormal,
  solarDirection,
  geographicTileBounds,
} from "./radar-globe-geodesy.ts";

test("WGS84 axes and metre heights are preserved at equator and poles", () => {
  assert.deepEqual(geodeticToWorld(0, 0), [0, 0, WGS84_A_KM]);
  assert.ok(Math.abs(geodeticToWorld(90, 20)[1] - WGS84_B_KM) < 1e-8);
  assert.ok(
    Math.abs(geodeticToWorld(0, 0, 125000)[2] - WGS84_A_KM - 125) < 1e-8,
  );
});
test("ECEF round trip preserves dateline, near-polar and high-altitude locations", () => {
  for (const lat of [-90, -89.99, -55, 0, 51.47, 89.99, 90])
    for (const lon of [-180, -75, 0, 179.999])
      for (const h of [0, 2200, 125000, 350000]) {
        const result = worldToGeodetic(geodeticToWorld(lat, lon, h));
        assert.ok(Math.abs(result.latitude - lat) < 1e-7);
        assert.ok(Math.abs(result.heightMetres - h) < 0.01);
        if (Math.abs(lat) < 90)
          assert.ok(Math.abs(result.longitude - lon) < 1e-7);
      }
});
test("normals point outwards and dateline positions join without a gap", () => {
  const p = geodeticToWorld(70, 34),
    n = geodeticNormal(70, 34);
  assert.ok(p.reduce((sum, value, i) => sum + value * n[i], 0) > 6300);
  const a = geodeticToWorld(30, -180),
    b = geodeticToWorld(30, 180);
  assert.ok(Math.hypot(...a.map((value, i) => value - b[i])) < 1e-8);
});
test("solar direction tracks equinox noon, midnight and June solstice", () => {
  const noon = worldToGeodetic(
    solarDirection(new Date("2026-03-20T12:00:00Z")).map((v) => v * WGS84_A_KM),
  );
  assert.ok(Math.abs(noon.latitude) < 1);
  assert.ok(Math.abs(noon.longitude) < 3);
  const midnight = solarDirection(new Date("2026-03-20T00:00:00Z"));
  assert.ok(midnight[2] < -0.99);
  assert.ok(solarDirection(new Date("2026-06-21T12:00:00Z"))[1] > 0.39);
});
test("geographic roots and child borders meet at poles and antimeridian", () => {
  assert.deepEqual(geographicTileBounds(0, 0, 0), {
    west: -180,
    east: 0,
    north: 90,
    south: -90,
  });
  const left = geographicTileBounds(3, 6, 2),
    right = geographicTileBounds(3, 7, 2);
  assert.equal(left.east, right.west);
  assert.equal(left.north, right.north);
});
