import assert from "node:assert/strict";
import test from "node:test";
import { GlobeGpuTimer } from "../components/radar-globe/gpu-timer.ts";

test("GPU queries retain refresh/reuse tags, never block, and bound pending work", () => {
  let created = 0, deleted = 0, available = false, disjoint = false;
  const gl = {
    QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2,
    getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
    isContextLost: () => false,
    createQuery: () => ({ id: ++created }),
    beginQuery() {}, endQuery() {}, deleteQuery() { deleted++; },
    getParameter: () => disjoint,
    getQueryParameter: (q, p) => p === 1 ? available : q.id * 1_000_000,
  };
  const timer = new GlobeGpuTimer(gl);
  for (const tag of ["volume-full", "reuse", "volume-moving", "reuse", "ignored"]) { timer.begin(tag); timer.end(); }
  assert.equal(created, 4);
  assert.equal(timer.poll(), null); assert.equal(deleted, 0);
  available = true;
  assert.deepEqual(timer.poll(), { ms: 1, tag: "volume-full" });
  assert.deepEqual(timer.poll(), { ms: 2, tag: "reuse" });
  assert.deepEqual(timer.poll(), { ms: 3, tag: "volume-moving" });
  disjoint = true; assert.equal(timer.poll(), null);
  assert.equal(deleted, 4); assert.equal(timer.latestMs, null);
  timer.dispose(); assert.equal(deleted, 4);
});

test("unsupported GPU timer extension is optional, not a renderer failure", () => {
  const timer = new GlobeGpuTimer({ getExtension: () => null });
  timer.begin("volume-full"); timer.end();
  assert.equal(timer.poll(), null); assert.equal(timer.latestMs, null);
  timer.dispose();
});
