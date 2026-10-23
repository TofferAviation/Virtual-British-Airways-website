import assert from "node:assert/strict";
import { globeViewportHeight } from "./radar-globe-navigation.ts";
import test from "node:test";
import { globeDragMode, globePanPosition, globePanDrag, globeLookDrag, nextGlobeFrame } from "./radar-globe-navigation.ts";
import { GlobeCloudCache, movingCloudSize } from "./radar-globe-cloud-cache.ts";

test("middle drag pans; right/modified drag looks; extra buttons cannot select flights", () => {
  assert.equal(globeDragMode(0, false), "orbit");
  assert.equal(globeDragMode(1, false), "pan");
  assert.equal(globeDragMode(1, true), "look");
  assert.equal(globeDragMode(2, false), "look");
  assert.equal(globeDragMode(0, true), "look");
  assert.equal(globeDragMode(3, false), null);
});
test("pan remains finite across poles/dateline and follows the view heading", () => {
  for (const latitude of [-90, -89.999, 0, 89.999, 90]) {
    const p = globePanPosition(latitude, 179.99, 12, 12);
    assert.ok(Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
    assert.ok(p.latitude >= -90 && p.latitude <= 90 && p.longitude >= -180 && p.longitude <= 180);
  }
  assert.ok(globePanPosition(0, 179.99, 10, 0).longitude < 0);
  const northUp = globePanDrag(100, 0, 5, 60, 1000, 0, 0);
  const eastUp = globePanDrag(100, 0, 5, 60, 1000, 90, 0);
  assert.ok(northUp.eastKm < 0 && Math.abs(northUp.northKm) < 1e-10);
  assert.ok(eastUp.northKm > 0 && Math.abs(eastUp.eastKm) < 1e-10);
  assert.ok(Number.isFinite(globePanDrag(100, 100, 5, 60, 0, 0, 90).northKm));
});
test("free look wraps heading and can look above the horizon without flipping", () => {
  const look = globeLookDrag(179, 90, 20, -100);
  assert.ok(Math.abs(look.bearing + 177.4) < 1e-10);
  assert.equal(look.pitch, 108);
  assert.equal(globeLookDrag(0, 90, 0, -10000).pitch, 175);
  assert.equal(globeLookDrag(0, 90, 0, 10000).pitch, 0);
});
test("frame pacing reaches 30/45/60 average caps on different refresh rates without catch-up bursts", () => {
  for (const hz of [60, 90, 100, 120, 144, 240]) for (const fps of [30, 45, 60]) {
    let deadline = 0, frames = 0;
    for (let i = 0; i < hz * 10; i++) {
      const next = nextGlobeFrame(i * 1000 / hz, deadline, fps);
      if (next !== null) { frames++; deadline = next; }
    }
    assert.ok(Math.abs(frames - fps * 10) <= 1, `${hz} Hz / ${fps} cap: ${frames}`);
    const afterStall = nextGlobeFrame(20000, deadline, fps);
    assert.ok(afterStall > 20000);
    assert.equal(nextGlobeFrame(20001, afterStall, fps), null);
  }
});
test("cloud cache invalidates on camera/weather/settings changes and expires while stationary", () => {
  const cache = new GlobeCloudCache();
  assert.equal(cache.shouldRefresh("viewA-weather1", 0), true);
  cache.commit("viewA-weather1", 0);
  assert.equal(cache.shouldRefresh("viewA-weather1", 100), false);
  assert.equal(cache.shouldRefresh("viewA-weather1", 2000), true);
  assert.equal(cache.shouldRefresh("viewB-weather1", 100), true);
  assert.equal(cache.shouldRefresh("viewA-weather2", 100), true);
  assert.equal(cache.shouldRefresh("viewA-weather1", 100, false), true);
  cache.invalidate(); assert.equal(cache.shouldRefresh("viewA-weather1", 100), true);
  assert.equal(cache.refreshes, 1); assert.equal(cache.hits, 1);
});
test("embedded viewport accounts for site zoom and wrapped toolbars without overflowing",()=>{
  for(const [height,top,scale] of [[1292,177.5,1.25],[712,218,1.25],[844,160,1]]) {
    assert.ok(Math.abs(globeViewportHeight(height,top,scale)*scale+top-height)<1e-8);
  }
  assert.equal(globeViewportHeight(200,100,1.25),240);
  assert.equal(globeViewportHeight(844,160,NaN),684);
});

test("motion uses the same allocation with a smaller cloud viewport, never coarsens ground or Low", () => {
  assert.deepEqual(movingCloudSize(1000, 500, false, false), { width: 1000, height: 500 });
  assert.deepEqual(movingCloudSize(1000, 500, true, false), { width: 720, height: 360 });
  assert.deepEqual(movingCloudSize(1000, 500, true, true), { width: 1000, height: 500 });
});
