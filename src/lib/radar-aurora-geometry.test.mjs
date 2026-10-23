import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import * as THREE from "three";
import {worldToGeodetic} from "./radar-globe-geodesy.ts";
import {AURORA_DETAIL,auroraArc,auroraFold,auroraNoise,auroraRayState,auroraSeed} from "./radar-aurora-shape.ts";
async function moduleUrl(relative,replace){let source=await readFile(new URL(relative,import.meta.url),"utf8");for(const [from,to] of Object.entries(replace))source=source.replace(JSON.stringify(from),JSON.stringify(to));return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString("base64")}`;}
const magnetic=await moduleUrl("./radar-aurora-magnetic.ts",{"./data/wmm2025":new URL("./data/wmm2025.ts",import.meta.url).href,"./radar-globe-geodesy":new URL("./radar-globe-geodesy.ts",import.meta.url).href});
const url=await moduleUrl("../components/radar-globe/aurora.ts",{"three":import.meta.resolve("three"),"@/lib/radar-aurora-field":new URL("./radar-aurora-field.ts",import.meta.url).href,"@/lib/radar-aurora-shape":new URL("./radar-aurora-shape.ts",import.meta.url).href,"@/lib/radar-globe-geodesy":new URL("./radar-globe-geodesy.ts",import.meta.url).href,"@/lib/radar-aurora-magnetic":magnetic});
const {buildAuroraCurtains,updateAuroraCurtains}=await import(url);
const data=(shift=0)=>({source:"NOAA SWPC OVATION Prime",observedAt:"2026-10-23T12:00:00Z",forecastAt:"2026-10-23T12:30:00Z",refreshedAt:"2026-10-23T12:00:00Z",samples:Array.from({length:360*10},(_,i)=>({longitude:Math.floor(i/10),latitude:i%10<5?66+i%5+shift:-73+i%5-shift,probability:70}))});
test("finite regional arcs have physical WGS84 heights, disconnected topology and bounded resources",()=>{
  const material=new THREE.ShaderMaterial();
  for(const quality of ["low","balanced","high"]){const group=buildAuroraCurtains(data(),material,quality);assert.equal(group.children.length,8);let bytes=0;
    let arcs=0;
    for(const mesh of group.children){const position=mesh.geometry.getAttribute("position"), field=mesh.geometry.getAttribute("aField"), shape=mesh.geometry.getAttribute("aArc"), {columns,rows,arcs:definitions}=mesh.userData;
      const stride=(columns+1)*(rows+1);arcs+=definitions.length;
      for(let arc=0;arc<definitions.length;arc++)for(const col of [0,Math.floor(columns/2),columns])for(const row of [0,Math.floor(rows/2),rows]){const i=arc*stride+col*(rows+1)+row,geo=worldToGeodetic([position.getX(i),position.getY(i),position.getZ(i)]);assert.ok(Math.abs(geo.heightMetres-field.getY(i)*1000)<1);assert.equal(shape.getX(arc*stride),0);assert.equal(shape.getX(arc*stride+columns*(rows+1)),1);}
      const index=mesh.geometry.index.array;
      for(let i=0;i<index.length;i+=3)assert.equal(Math.floor(index[i]/stride),Math.floor(index[i+2]/stride),"triangles must not bridge separate arcs");
      assert.equal(position.count,definitions.length*stride);
      for(const a of Object.values(mesh.geometry.attributes))bytes+=a.array.byteLength;bytes+=mesh.geometry.index.array.byteLength;
    }
    assert.equal(arcs,AURORA_DETAIL[quality].lanes*12*2);
    assert.ok(arcs>=192);assert.ok(bytes<16*1024*1024,`${quality} exceeded 16 MiB: ${bytes}`);group.children.forEach(m=>m.geometry.dispose());
  }material.dispose();
});
test("arc shapes are independent, deterministic and wrap through the dateline without a hard seam",()=>{
  const arcs=Array.from({length:96},(_,i)=>auroraArc(Math.floor(i/12),i%12,1,8));
  assert.equal(new Set(arcs.map(a=>a.seed)).size,96);
  assert.ok(new Set(arcs.map(a=>Math.floor(a.span))).size>20);
  assert.ok(arcs.some(a=>a.centre-a.span/2<0));assert.ok(arcs.some(a=>a.centre+a.span/2>360));
  assert.deepEqual(arcs[37],auroraArc(3,1,1,8));assert.notDeepEqual(arcs[37],auroraArc(3,1,-1,8));
  assert.ok(arcs.every(a=>a.quantile>0&&a.quantile<1&&a.span<70));
  const weights=Object.values(AURORA_DETAIL).map(profile=>{
    let total=0;for(let lane=0;lane<profile.lanes;lane++)for(let sector=0;sector<profile.sectors;sector++)total+=auroraArc(lane,sector,1,profile.lanes).weight;return total;
  });
  assert.ok(weights.every(w=>Math.abs(w-weights[0])<1e-9),"higher LOD cannot add total emission weight");
});
test("dancing folds are continuous, bounded and independently evolving, including lattice boundaries",()=>{
  for(const seed of [3.17,29.7,181.37])for(let s=0;s<3000;s+=71)for(let t=0;t<90;t+=7){
    const a=auroraFold(s,seed,t),b=auroraFold(s,seed,t+1/60);
    assert.ok(Math.abs(a.north)<100&&Math.abs(a.east)<50);
    assert.ok(Math.hypot(a.north-b.north,a.east-b.east)<.65,"no frame-to-frame jumps");
    assert.deepEqual(a,auroraFold(s,seed,t),"pause/replay has no random reset");
  }
  assert.ok(Math.abs(auroraNoise(2-1e-6,5)-auroraNoise(2+1e-6,5))<1e-5);
  assert.ok(Math.abs(auroraNoise(3,4-1e-6)-auroraNoise(3,4+1e-6))<1e-5);
  let distance=0,samples=0;
  for(let s=0;s<3000;s+=71){const a=auroraFold(s,3.17,10),b=auroraFold(s,3.17,16);distance+=Math.hypot(a.north-b.north,a.east-b.east);samples++;}
  assert.ok(distance/samples>3,"regional motion must be visible within six seconds; individual knots may pause");
  assert.notDeepEqual(auroraFold(600,3.17,16),auroraFold(600,19.3,16));
});
test("forecast morph reuses geometry/buffers, retaining an exact in-progress endpoint",()=>{
  const material=new THREE.ShaderMaterial(),group=buildAuroraCurtains(data(),material,"low"),mesh=group.children[0],geometry=mesh.geometry,from=geometry.getAttribute("position"),to=geometry.getAttribute("aNextPosition"),original=from.array.slice();
  updateAuroraCurtains(group,data(2),1);assert.equal(mesh.geometry,geometry);assert.equal(geometry.getAttribute("position"),from);assert.equal(geometry.getAttribute("aNextPosition"),to);assert.deepEqual(from.array,original);assert.notDeepEqual(to.array,original);
  const endpoint=to.array.slice();updateAuroraCurtains(group,data(3),.5);for(let i=0;i<from.array.length;i+=131)assert.ok(Math.abs(from.array[i]-(original[i]+endpoint[i])/2)<.001);
  updateAuroraCurtains(group,data(12),1);
  for(const m of group.children)for(const name of ["position","aNextPosition"]){const p=m.geometry.getAttribute(name);for(let i=0;i<p.count;i+=71)assert.ok(m.geometry.boundingSphere.containsPoint(new THREE.Vector3().fromBufferAttribute(p,i)),"both forecast endpoints stay inside culling bounds");}
  group.children.forEach(m=>m.geometry.dispose());material.dispose();
});
test("vertical ray bundles independently brighten, die back and vary emission height",()=>{
  for(const seed of [3.17,29.7,181.37]){
    const samples=Array.from({length:161},(_,i)=>auroraRayState(600,seed,i*.2));
    const energy=samples.map(v=>v.energy),tops=samples.map(v=>v.top);
    assert.ok(Math.max(...energy)-Math.min(...energy)>.5,"not just a scrolling static stripe");
    assert.ok(Math.max(...tops)-Math.min(...tops)>30,"ray height follows its own event");
    assert.ok(samples.every(v=>Object.values(v).every(Number.isFinite)&&v.energy>=0&&v.energy<=2.2&&v.top>=95&&v.top<=340));
    assert.notDeepEqual(samples[50],auroraRayState(675,seed,10),"neighbouring bundles must not pulse in lockstep");
    assert.deepEqual(samples[50],auroraRayState(600,seed,10),"pause/replay is deterministic");
  }
});
test("ray events and spatial cell crossings remain continuous, including event reseeding",()=>{
  for(const seed of [3.17,29.7,181.37])for(let s=-76;s<1500;s+=38){
    for(const t of [0,3.91,17.22,81.99]){
      const a=auroraRayState(s-1e-5,seed,t),b=auroraRayState(s+1e-5,seed,t);
      assert.ok(Math.abs(a.energy-b.energy)<1e-5&&Math.abs(a.top-b.top)<1e-3,"no vertical seam between packet cells");
      const c=auroraRayState(s,seed,t+1/60);
      assert.ok(Math.abs(c.energy-b.energy)<.1,"no frame-to-frame flashing");
    }
    const key=Math.floor(s/38)*11.73+seed*3.17,period=4+auroraSeed(key)*10;
    const boundary=period*7-auroraSeed(key+1)*30;
    const a=auroraRayState(s,seed,boundary-1e-6),b=auroraRayState(s,seed,boundary+1e-6);
    assert.ok(Math.abs(a.energy-b.energy)<1e-5&&Math.abs(a.top-b.top)<1e-3,"new event seed cannot pop its ray");
  }
});
