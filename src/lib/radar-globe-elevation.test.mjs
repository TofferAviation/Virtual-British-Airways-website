import assert from "node:assert/strict";
import test from "node:test";
import {terrariumHeight,mercatorPosition,terrainHeight} from "./radar-globe-elevation.ts";
test("Terrarium decodes metres, fractional heights and bathymetry without RGB filtering",()=>{
  assert.equal(terrariumHeight(128,0,0),0);assert.equal(terrariumHeight(137,219,68),2523.265625);assert.equal(terrariumHeight(127,255,0),-1);
});
test("Mercator projection places Greenwich/equator correctly and clamps polar input",()=>{
  assert.deepEqual(mercatorPosition(0,0,2),{x:2,y:2});assert.ok(Number.isFinite(mercatorPosition(90,180,14).y));
  assert.equal(mercatorPosition(20,-180,4).x,0);assert.equal(mercatorPosition(20,180,4).x,16);
});
test("collision height agrees with rendered triangles, including saddle and boundaries",()=>{
  const grid=new Float32Array([0,10,20,100]);
  assert.equal(terrainHeight(grid,2,0.5,0.5),15);
  assert.equal(terrainHeight(grid,2,1,1),100);
  assert.equal(terrainHeight(grid,2,0.75,0.75),57.5);
  assert.equal(terrainHeight(grid,2,-1,-1),0);
});
