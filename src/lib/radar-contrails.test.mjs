import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import * as THREE from "three";
import ts from "typescript";
import {CONTRAIL_PROFILES,CONTRAIL_MAX_POINTS,contrailEngines} from "./radar-contrails.ts";
import {geodeticToWorld} from "./radar-globe-geodesy.ts";
const root=new URL("../../",import.meta.url),read=path=>readFile(new URL(path,root),"utf8");
let source=await read("src/components/radar-globe/contrails.ts");
source=source.replaceAll('"three"',JSON.stringify(import.meta.resolve("three"))).replaceAll('"@/lib/radar-contrails"',JSON.stringify(new URL("./radar-contrails.ts",import.meta.url).href));
const {GlobeContrails}=await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString("base64")}`);
const makeSource=(id="one",key="a380")=>({id,key,position:new THREE.Vector3(...geodeticToWorld(0,0,11000)),rotation:new THREE.Quaternion(),selected:id==="one",enabled:true,anchorBoost:1});
const makeLayer=()=>new GlobeContrails(new THREE.MeshBasicMaterial());
const camera=new THREE.Vector3(...geodeticToWorld(0,0,30000));
function move(layer,sources,seconds,quality="high",fps=60){for(let frame=1;frame<=seconds*fps;frame++){for(const s of sources)s.position.x=frame/fps*.2;layer.update(sources,camera,frame/fps*1000,quality,true);}}

test("all 14 airframes have bounded engine anchors; four-engine jets stay four, unknowns stay unsupported",()=>{
  assert.deepEqual(Object.values(CONTRAIL_PROFILES).map(p=>p.aircraft),[4,8,16,24]);
  for(const key of ["a318","a319","a320","a321","a332","a333","a359","a380","b738","b744","b772","b773","b788","b789"]){
    const anchors=contrailEngines(key);assert.equal(anchors.length,["a380","b744"].includes(key)?4:2);
    assert.ok(anchors.every(p=>p.length===3&&p.every(Number.isFinite)&&Math.abs(p[0])<40&&Math.abs(p[1])<12&&Math.abs(p[2])<20));
    assert.ok(anchors.some(p=>p[0]<0)&&anchors.some(p=>p[0]>0));
  }
  assert.deepEqual(contrailEngines("unsupported"),[]);
});

test("moving smooth sources leave engine-separated world-anchored trails, with a continuous tip",()=>{
  const layer=makeLayer(),s=makeSource();layer.update([s],camera,0,"high",true);move(layer,[s],2);
  const mesh=layer.group.children[0],geometry=mesh.geometry,position=geometry.getAttribute("position"),born=geometry.getAttribute("aBorn");
  assert.ok(mesh.visible);assert.equal(mesh.layers.mask,1<<8);assert.ok(!mesh.layers.isEnabled(5)&&!mesh.layers.isEnabled(6));
  assert.ok(geometry.drawRange.count>0);assert.ok(layer.stats.points<CONTRAIL_MAX_POINTS);
  const old=new THREE.Vector3().fromBufferAttribute(position,0).add(mesh.position);
  s.position.x+=.003;layer.update([s],camera,2015,"high",true);
  assert.ok(new THREE.Vector3().fromBufferAttribute(position,0).add(mesh.position).distanceTo(old)<1e-8,"stored knots don't travel with the aircraft");
  const tip=position.updateRanges[0].start/3+2;
  assert.ok(Math.abs(born.getX(tip)-2.015)<1e-6,"tip updates between the slower stored knots");
  const left=new THREE.Vector3().fromBufferAttribute(position,tip).add(mesh.position);
  assert.ok(Math.abs(left.x-s.position.x-contrailEngines("a380")[0][0]/1000)<1e-6);
  for(const a of Object.values(geometry.attributes))assert.ok([...a.array].every(Number.isFinite));
  layer.dispose();
});

test("ribbons reuse their buffers and remain bounded at 30/60/144 fps and all quality tiers",()=>{
  for(const fps of [30,60,144])for(const quality of ["low","medium","high","ultra"]){
    const layer=makeLayer(),s=makeSource();layer.update([s],camera,0,quality,true);
    const geometry=layer.group.children[0].geometry,buffer=geometry.getAttribute("position").array;
    move(layer,[s],75,quality,fps);
    assert.equal(layer.group.children[0].geometry,geometry);assert.equal(geometry.getAttribute("position").array,buffer);
    assert.ok(layer.stats.points<CONTRAIL_MAX_POINTS);assert.ok(geometry.drawRange.count<=254*4*6);
    const head=geometry.getAttribute("position"),n=layer.stats.points;
    assert.ok(new THREE.Vector3().fromBufferAttribute(head,n*4).add(layer.group.children[0].position).distanceTo(s.position)<.04);
    layer.dispose();
  }
});

test("low-end budgets prioritise selected traffic and downshift/release allocations immediately",()=>{
  const layer=makeLayer(),sources=Array.from({length:30},(_,i)=>makeSource(i===29?"one":String(i),"a320"));
  layer.update(sources,camera,0,"ultra",true);assert.equal(layer.stats.aircraft,24);
  let disposed=0;for(const m of layer.group.children)m.geometry.addEventListener("dispose",()=>disposed++);
  layer.update(sources,camera,16,"low",true);assert.equal(layer.stats.aircraft,4);assert.equal(disposed,20);
  assert.ok(layer.trails.has("one"));
  layer.update(sources,camera,32,"low",false);assert.equal(layer.stats.aircraft,0);assert.equal(layer.group.children.length,0);assert.equal(disposed,24);
  assert.equal(layer.stats.enabled,false);layer.dispose();
});

test("parked/unknown/low/engine-off sources emit nothing; disappeared aircraft dispose cleanly",()=>{
  const layer=makeLayer(),s=makeSource();s.enabled=false;layer.update([s],camera,0,"high",true);assert.equal(layer.stats.aircraft,0);
  s.enabled=true;s.key="unknown";layer.update([s],camera,16,"high",true);assert.equal(layer.stats.aircraft,0);
  s.key="a320";layer.update([s],camera,32,"high",true);assert.equal(layer.stats.points,0);
  let disposed=0;layer.group.children[0].geometry.addEventListener("dispose",()=>disposed++);
  layer.update([],camera,48,"high",true);assert.equal(disposed,1);assert.equal(layer.stats.aircraft,0);layer.dispose();
});

test("teleports and background resumes cannot draw enormous bridging streaks",()=>{
  const layer=makeLayer(),s=makeSource();layer.update([s],camera,0,"high",true);move(layer,[s],3);
  s.position.x+=100;layer.update([s],camera,3016,"high",true);assert.equal(layer.stats.points,0);assert.equal(layer.stats.draws,0);
  move(layer,[s],4);layer.update([s],camera,60000,"high",true);assert.equal(layer.stats.points,0);layer.dispose();
});

test("held flights do not keep spawning; old trails age out instead of remaining forever",()=>{
  const layer=makeLayer(),s=makeSource();layer.update([s],camera,0,"low",true);move(layer,[s],5,"low");
  const newest=layer.trails.get("one").points.at(-1).born;
  for(let now=5016;now<30000;now+=16)layer.update([s],camera,now,"low",true);
  assert.equal(layer.stats.points,0);assert.equal(layer.stats.draws,0);assert.ok(newest<=5);layer.dispose();
});

test("only measured display history seeds initial trails; inputs and playback remain untouched",()=>{
  const layer=makeLayer(),s=makeSource(),history=[3,2,1].map(age=>({position:s.position.clone().add(new THREE.Vector3(-age*.2,0,0)),rotation:s.rotation.clone(),age}));
  const original=history.map(p=>p.position.toArray());s.history=()=>history;
  layer.update([s],camera,5000,"high",true);assert.equal(layer.stats.points,3);assert.equal(layer.stats.draws,1);
  assert.deepEqual(history.map(p=>p.position.toArray()),original);layer.dispose();
});

test("render integration probes foreground clouds without changing the accepted cloud shader or invalidating its cache",async()=>{
  const scene=await read("src/components/radar-globe/scene.ts"),shader=await read("src/components/radar-globe/contrail-shaders.ts"),ui=await read("src/components/BaRadarThreeGlobe.tsx");
  assert.match(shader,/lightDensityAt/);assert.match(shader,/i<8/);assert.match(shader,/end=min\(distanceKm,hit.y\)/);
  assert.match(shader,/ground.x<distanceKm/);assert.match(shader,/logdepthbuf_fragment/);assert.match(shader,/smoothstep\(uTrailLife/);
  assert.match(scene,/camera.layers.set\(8\);renderer.render/);assert.doesNotMatch(scene.match(/const signature = .*$/m)[0],/contrail/);
  assert.match(scene,/contrails.dispose\(\);contrailMaterial.dispose/);assert.match(ui,/Contrails · visual effect/);
});
