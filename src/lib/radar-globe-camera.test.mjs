import assert from "node:assert/strict";
import test from "node:test";
import { WGS84_A_KM } from "./radar-globe-geodesy.ts";
import { globeClipRange, globeZoomTarget, globeZoomStep, globeAltitudeStep, globeDescentFloor, globeOverviewDistance } from "./radar-globe-geodesy.ts";

test("a fresh embedded globe fits its atmosphere in landscape and portrait viewports", () => {
  for (const aspect of [.8, 1, 16/9, 3]) {
    const distance = globeOverviewDistance(aspect);
    const halfAngle = Math.min(35*Math.PI/360, Math.atan(Math.tan(35*Math.PI/360)*aspect));
    assert.ok(Math.asin((WGS84_A_KM+450)/distance) < halfAngle, `cropped atmosphere at ${aspect}`);
    assert.ok(distance < WGS84_A_KM+40000);
    // Camera persistence still uses the existing reversible zoom mapping.
    const zoom = -Math.log((distance/WGS84_A_KM-1)/1.7)/.38;
    assert.ok(Math.abs(WGS84_A_KM*(1+1.7*Math.exp(-zoom*.38))-distance)<1e-8);
  }
  assert.equal(globeOverviewDistance(3),globeOverviewDistance(1));
  assert.ok(globeOverviewDistance(.8)>globeOverviewDistance(1));
});

test("overview fitting is finite and bounded even for hidden or malformed hosts", () => {
  for (const aspect of [0,-1,NaN,Infinity,.01]) for (const fov of [0,NaN,Infinity,180]) {
    const distance=globeOverviewDistance(aspect,fov);
    assert.ok(Number.isFinite(distance)&&distance>WGS84_A_KM+450&&distance<=WGS84_A_KM+40000);
  }
});

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
test("DEM readiness releases descent from rest without a catch-up drop",()=>{
  let h=9.1,v=0;
  for(let i=0;i<120;i++){const next=globeAltitudeStep(h,.105,v,.1,false,1/60);h=next.heightKm;v=next.velocityKmS;}
  assert.equal(h,9.1);assert.equal(v,0);
  const first=globeAltitudeStep(h,.105,v,.1,true,1/60);
  assert.ok(h-first.heightKm<.004,"no kilometre-sized first frame after DEM arrives");
  let prior=h;
  for(let i=0;i<1200;i++){const next=globeAltitudeStep(h,.105,v,.1,true,1/60);h=next.heightKm;v=next.velocityKmS;assert.ok(h<=prior&&h>=.105);assert.ok(prior-h<.12);prior=h;}
  assert.ok(Math.abs(h-.105)<1e-6);
});
test("loading gaps hold an already low eye instead of launching it to the 9.1 km barrier",()=>{
  assert.equal(globeDescentFloor(.205,.1,false),.205);
  const next=globeAltitudeStep(.205,.105,-.3,.1,false,1/30);
  assert.equal(next.heightKm,.205);assert.equal(next.velocityKmS,0);
  const escape=globeAltitudeStep(.05,.105,-.2,.1,true,1/60);
  assert.ok(escape.heightKm>=.105,"actual terrain collision protection is retained");
});
test("dolly trajectory is consistent at Low/High/high-refresh rates and bounds stall catch-up",()=>{
  const run=hz=>{let h=12,v=0;for(let i=0;i<hz*5;i++){const n=globeAltitudeStep(h,.005,v,0,true,1/hz);h=n.heightKm;v=n.velocityKmS;}return h;};
  assert.ok(Math.abs(run(30)-run(60))<.01);
  assert.ok(Math.abs(run(144)-run(60))<.015);
  assert.deepEqual(globeAltitudeStep(9.1,.005,0,0,true,2),globeAltitudeStep(9.1,.005,0,0,true,.1));
});
