import assert from "node:assert/strict";
import test from "node:test";
import { WGS84_A_KM } from "./radar-globe-geodesy.ts";
import { globeClipRange, globeZoomTarget, globeZoomStep } from "./radar-globe-geodesy.ts";

test("depth precision resolves cloud/ground separation at every supported zoom", () => {
  for (const height of [0.005, 0.02, 4, 6, 12, 90, 400, 2600, 16000, 40000]) {
    const { near, far } = globeClipRange(WGS84_A_KM + height);
    assert.ok(near < height);
    assert.ok(far > height + WGS84_A_KM * 2);
    // One 24-bit perspective depth quantum at the near-side ground, in km.
    const quantum = height * height * (far - near) / (far * near * (2 ** 24 - 1));
    assert.ok(quantum < 0.01, `depth error ${quantum} km at ${height} km`);
  }
});

test("wheel modes agree and extreme deltas allow the ground collision floor", () => {
  const d = WGS84_A_KM + 400;
  assert.equal(globeZoomTarget(d, 16, 0, 800), globeZoomTarget(d, 1, 1, 800));
  assert.equal(globeZoomTarget(d, 80, 0, 800), globeZoomTarget(d, 0.1, 2, 800));
  let close = d, far = d;
  for (let i = 0; i < 200; i++) {
    close = globeZoomTarget(close, -1e8, 0, 800);
    far = globeZoomTarget(far, 1e8, 0, 800);
  }
  assert.equal(close, WGS84_A_KM + 0.005);
  assert.equal(far, WGS84_A_KM + 40000);
});
test("inside-curtain camera keeps nearby emission instead of slicing kilometre-wide panes",()=>{
  const distance=WGS84_A_KM+148.846;
  assert.equal(globeClipRange(distance,true).near,.01);
  assert.ok(globeClipRange(distance).near>37);
  assert.equal(globeClipRange(distance,true).far,globeClipRange(distance).far);
  assert.ok(globeClipRange(WGS84_A_KM+.005,true).near<.005,"ground clearance is still respected");
});

test("zoom damping neither overshoots nor depends on frame rate", () => {
  let a = 22000, b = a;
  for (let i = 0; i < 60; i++) a = globeZoomStep(a, 7000, 1 / 60);
  for (let i = 0; i < 144; i++) b = globeZoomStep(b, 7000, 1 / 144);
  assert.ok(Math.abs(a - b) < 1e-8);
  assert.ok(a > 7000 && a < 7001);
  assert.equal(globeZoomStep(a, 7000, 0), a);
});
test("ground zoom uses clearance, not mountain elevation as its dolly speed",()=>{
  const sea=globeZoomTarget(WGS84_A_KM+.005,80,0,800),mountain=globeZoomTarget(WGS84_A_KM+3+.005,80,0,800,3);
  assert.ok(Math.abs(mountain-sea-3)<1e-9);
  assert.equal(globeZoomTarget(WGS84_A_KM+3,-160,0,800,3),WGS84_A_KM+3+.005);
});
