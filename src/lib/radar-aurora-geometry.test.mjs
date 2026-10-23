import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import * as THREE from "three";
import {worldToGeodetic} from "./radar-globe-geodesy.ts";
import {AURORA_DETAIL,auroraArc,auroraFold,auroraNoise,auroraRayState,auroraSeed,auroraRayTime,auroraRayPeriod} from "./radar-aurora-shape.ts";
import {DEFAULT_AURORA_MOTION_SPEED,advanceAuroraTime,auroraMotionSpeed} from "./radar-aurora-motion.ts";
import {auroraKpOverride,auroraKpField} from "./radar-aurora-kp.ts";
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
    const key=Math.floor(s/38)*11.73+seed*3.17,period=auroraRayPeriod(key),target=period*7-auroraSeed(key+1)*30;
    // Invert the monotonic per-bundle clock to hit an actual reseed boundary.
    let lo=-1000,hi=1000;for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(auroraRayTime(key,mid)<target)lo=mid;else hi=mid;}
    const boundary=(lo+hi)/2;
    const a=auroraRayState(s,seed,boundary-1e-6),b=auroraRayState(s,seed,boundary+1e-6);
    assert.ok(Math.abs(a.energy-b.energy)<1e-5&&Math.abs(a.top-b.top)<1e-3,"new event seed cannot pop its ray");
  }
});

test("calmer shared clock is frame-rate independent, pause-safe and cannot catch up after a stall",()=>{
  assert.equal(DEFAULT_AURORA_MOTION_SPEED,.3);
  for(const fps of [30,45,60,144]){
    let clock=0;for(let i=0;i<20*fps;i++)clock=advanceAuroraTime(clock,1/fps,DEFAULT_AURORA_MOTION_SPEED);
    assert.ok(Math.abs(clock-6)<1e-9,"20 real seconds must advance six animation seconds");
    assert.equal(advanceAuroraTime(clock,.1,0),clock);
    assert.equal(advanceAuroraTime(clock,.1,.5),clock+.05,"speed changes keep phase");
  }
  assert.equal(advanceAuroraTime(10,30,.3),10.03);
  assert.equal(advanceAuroraTime(10,NaN,.3),10);
  assert.equal(auroraMotionSpeed(NaN),.3);assert.equal(auroraMotionSpeed(-2),0);assert.equal(auroraMotionSpeed(99),1.8);
});

test("local ray tempo eases independently without reversing, jumping or repeating one uniform rate",()=>{
  const rates=[];
  for(const key of [-382,3.17,29.7,181.37,2201]){
    assert.equal(auroraRayTime(key,0),0);
    const local=[];
    for(let time=-30;time<=120;time+=.37){
      const a=auroraRayTime(key,time),b=auroraRayTime(key,time+1/60),rate=(b-a)*60;
      assert.ok(rate>.479&&rate<1.521,"bounded, strictly forward motion");
      assert.deepEqual(a,auroraRayTime(key,time));local.push(rate);
    }
    assert.ok(Math.max(...local)-Math.min(...local)>.35,"each bundle relaxes and accelerates rather than ticking uniformly");
    rates.push(local[30]);
  }
  assert.ok(new Set(rates.map(r=>r.toFixed(2))).size>=4,"neighbours do not all share one tempo");
});

test("default tempo materially reduces frame-to-frame vertical and brightness changes",()=>{
  let slow=0,old=0;
  for(const seed of [3.17,29.7,181.37])for(let t=0;t<90;t+=.31){
    const a=auroraRayState(600,seed,t),b=auroraRayState(600,seed,t+DEFAULT_AURORA_MOTION_SPEED/60),c=auroraRayState(600,seed,t+1/60);
    slow+=Math.abs(a.energy-b.energy)+Math.abs(a.top-b.top)*.01;
    old+=Math.abs(a.energy-c.energy)+Math.abs(a.top-c.top)*.01;
  }
  assert.ok(slow<old*.4,"calmer changes, without flattening the existing ray shapes");
});

test("manual Kp is opt-in, bounded and treats zero as a real override",()=>{
  assert.equal(auroraKpOverride({}),null);
  assert.equal(auroraKpOverride({kpOverrideEnabled:false,kpOverride:9}),null);
  assert.equal(auroraKpOverride({kpOverrideEnabled:true,kpOverride:0}),0);
  assert.equal(auroraKpOverride({kpOverrideEnabled:true,kpOverride:-12}),0);
  assert.equal(auroraKpOverride({kpOverrideEnabled:true,kpOverride:99}),9);
  assert.equal(auroraKpOverride({kpOverrideEnabled:true,kpOverride:NaN}),5);
});

test("illustrative Kp grids remain deterministic, bounded, seam-safe and present in both hemispheres",()=>{
  for(const kp of [0,3,5,9]){
    const field=auroraKpField(kp);assert.equal(field.length,360*181);assert.deepEqual(field,auroraKpField(kp));
    assert.ok(field.subarray(0,90*360).some(v=>v>0));assert.ok(field.subarray(91*360).some(v=>v>0));
    assert.ok(field.subarray(0,360).every(v=>v===0)&&field.subarray(180*360).every(v=>v===0),"no artificial polar fan");
    for(let row=0;row<181;row++)assert.ok(Math.abs(field[row*360]-field[row*360+359])<45,"no hard dateline seam");
  }
});

test("higher simulated Kp is brighter, broader and extends equatorward, never altering live source samples",()=>{
  const moments=kp=>{
    const grid=auroraKpField(kp);let total=0,latitude=0,lower=0;
    for(let y=0;y<181;y++)for(let x=0;x<360;x++){
      const lat=Math.abs(90-y),w=grid[y*360+x]*Math.cos(lat*Math.PI/180);
      total+=w;latitude+=w*lat;if(lat<60)lower+=w;
    }
    return {total,latitude:latitude/total,lower:lower/total};
  };
  const quiet=moments(0),storm=moments(9);
  assert.ok(storm.total>quiet.total*5);assert.ok(storm.latitude<quiet.latitude-10);assert.ok(storm.lower>quiet.lower+.3);
  const live=data(),snapshot=JSON.stringify(live),material=new THREE.ShaderMaterial();
  const group=buildAuroraCurtains(null,material,"low",auroraKpField(0)),mesh=group.children[0],geometry=mesh.geometry;
  updateAuroraCurtains(group,null,1,auroraKpField(9));assert.equal(mesh.geometry,geometry);assert.equal(group.children.length,8);
  updateAuroraCurtains(group,live,1);assert.equal(mesh.geometry,geometry);assert.equal(JSON.stringify(live),snapshot);
  group.children.forEach(m=>m.geometry.dispose());material.dispose();
});
