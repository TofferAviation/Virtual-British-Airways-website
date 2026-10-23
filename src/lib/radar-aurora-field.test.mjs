import assert from "node:assert/strict";
import test from "node:test";
import {auroraField,auroraAt,auroraTrack,validateOvation} from "./radar-aurora-field.ts";
test("forecast field respects independent hemispheres, wrapping and quiet cells",()=>{
  const samples=[];
  for(let lon=0;lon<360;lon++)for(const lat of [60,61,70,71,-75,-76])samples.push({longitude:lon,latitude:lat,probability:lat>0?80:20});
  const grid=auroraField(samples);
  assert.ok(auroraAt(grid,60,0)>.79);assert.ok(auroraAt(grid,-75,0)<.21);assert.equal(auroraAt(grid,0,0),0);
  assert.equal(auroraAt(grid,60,359.5),auroraAt(grid,60,-.5));
  assert.ok(auroraTrack(grid,0,1,.2).latitude<65);assert.ok(auroraTrack(grid,0,1,.8).latitude>65);
  assert.ok(auroraTrack(grid,0,-1,.5).latitude<-70);
  assert.equal(auroraTrack(new Uint8Array(65160),0,1,.5).strength,0);
});
const snapshot=()=>({"Data Format":"[Longitude, Latitude, Aurora]","Observation Time":"2026-10-23T12:00:00Z","Forecast Time":"2026-10-23T12:30:00Z",coordinates:Array.from({length:65160},(_,i)=>[Math.floor(i/181),i%181-90,i%181===160?75:0])});
test("NOAA validation preserves the full one-degree grid, including zero activity",()=>{
  const field=validateOvation(snapshot());assert.equal(field.samples.length,65160);assert.equal(field.width,360);assert.equal(field.height,181);assert.equal(field.observedAt,"2026-10-23T12:00:00.000Z");assert.ok(field.samples.some(p=>p.probability===0));
});
test("malformed, transposed, incomplete, duplicate and mistimed forecasts fail closed",()=>{
  for(const change of [s=>s.coordinates.pop(),s=>s.coordinates.push(s.coordinates[0]),s=>s.coordinates[0][2]=NaN,s=>s["Data Format"]="[Latitude, Longitude, Aurora]",s=>s["Forecast Time"]="bad",s=>s["Forecast Time"]="2026-10-23T11:00:00Z"]){ const s=snapshot();change(s);assert.throws(()=>validateOvation(s)); }
});
