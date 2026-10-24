import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import {AircraftFollow} from "./radar-aircraft-follow.ts";
import {AircraftMotion} from "./radar-aircraft-motion.ts";
import {aircraftFrame} from "./radar-aircraft.ts";
import {geodeticToWorld} from "./radar-globe-geodesy.ts";

const pose=(overrides={})=>({latitude:53,longitude:-3,altitudeFt:36000,headingDeg:359,...overrides});
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function offset(camera,p){
  const a=geodeticToWorld(p.latitude,p.longitude,p.altitudeFt*.3048),b=geodeticToWorld(camera.latitude,camera.longitude,camera.heightKm*1000);
  const d=b.map((v,i)=>v-a[i]),frame=aircraftFrame(p.latitude,p.longitude,p.headingDeg);
  return [frame.right,frame.up,frame.back].map(axis=>axis.reduce((sum,v,i)=>sum+v*d[i],0));
}

test("explicit follow starts a metre-scale chase view at real displayed altitude, including poles",()=>{
  for(const latitude of [-90,-89,0,53,89,90])for(const longitude of [-180,-3,179.99]){
    const p=pose({latitude,longitude}),original=JSON.stringify(p),follow=new AircraftFollow(),camera=follow.start("one",p,0);
    assert.equal(follow.id,"one");assert.ok(camera);
    offset(camera,p).forEach((v,i)=>close(v,[0,.25,.2][i]));
    close(camera.bearing,359);close(camera.pitch,Math.atan2(.2,.25)*180/Math.PI);
    assert.equal(JSON.stringify(p),original,"never changes telemetry");
  }
});

test("camera shares the aircraft's smooth playback with sparse five-second reports at 30/60/144 fps",()=>{
  const utc=Date.parse("2026-10-24T12:00:00Z");
  const report=t=>({...pose(),latitude:53+t*.002,altitudeFt:36000+t*10,headingDeg:(359+t*.4)%360,timestamp:new Date(utc+t*1000).toISOString()});
  const endpoints=[];
  for(const fps of [30,60,144]){
    const motion=new AircraftMotion(),follow=new AircraftFollow();
    motion.sync(report(0),Array.from({length:7},(_,i)=>report((i-6)*5)),0,utc);
    let camera=follow.start("one",motion.sample(0),0),last={...camera};
    for(let frame=1;frame<=20*fps;frame++){
      const t=frame/fps,now=t*1000;
      if(frame%(5*fps)===0)motion.sync(report(t),[],now,utc+now);
      const p=motion.sample(now);camera=follow.advance("one",p,camera,now);assert.ok(camera);
      offset(camera,p).forEach((v,i)=>close(v,[0,.25,.2][i],2e-5));
      assert.ok(Math.abs(camera.latitude-last.latitude)<.0001,"no poll-sized camera jump");last=camera;
    }
    endpoints.push(camera);
  }
  for(const camera of endpoints){close(camera.latitude,endpoints[0].latitude);close(camera.longitude,endpoints[0].longitude);close(camera.heightKm,endpoints[0].heightKm);}
});

test("follow transports manual pan/look/zoom offsets rather than resetting the chase preset",()=>{
  const follow=new AircraftFollow(),a=pose(),initial=follow.start("one",a,0);
  const camera={...initial,latitude:initial.latitude+.001,longitude:initial.longitude+.001,heightKm:initial.heightKm+.5,bearing:20,pitch:70};
  const expected=offset(camera,a),b=pose({latitude:53.001,headingDeg:1,altitudeFt:36100});
  const next=follow.advance("one",b,camera,1000);assert.ok(next);
  offset(next,b).forEach((v,i)=>close(v,expected[i]));close(next.bearing,22);close(next.pitch,70);
});

test("stationary or stale display holds the eye exactly, without camera drift",()=>{
  const follow=new AircraftFollow(),p=pose(),camera=follow.start("one",p,0);
  for(let i=1;i<500;i++)assert.equal(follow.advance("one",p,camera,i*1000),camera);
});

test("dateline and heading crossings are continuous and high-latitude views remain finite",()=>{
  for(const latitude of [-89.99,0,89.99]){
    const follow=new AircraftFollow(),a=pose({latitude,longitude:179.999}),camera=follow.start("one",a,0);
    const b=pose({latitude,longitude:-179.999,headingDeg:1}),next=follow.advance("one",b,camera,1000);
    assert.ok(next&&Object.values(next).every(Number.isFinite));
    offset(next,b).forEach((v,i)=>close(v,[0,.25,.2][i]));close(next.bearing,1);
  }
});

test("selection changes, missing/invalid positions and relocations stop without moving the eye",()=>{
  for(const [id,p]of [["two",pose()],["",null],["one",undefined],["one",pose({latitude:NaN})],["one",pose({longitude:30})],["one",pose({altitudeFt:46000})]]){
    const follow=new AircraftFollow(),camera=follow.start("one",pose(),0),before=JSON.stringify(camera);
    assert.equal(follow.advance(id,p,camera,16),null);assert.equal(follow.id,"");assert.equal(JSON.stringify(camera),before);
  }
  const follow=new AircraftFollow();assert.equal(follow.start("one",null,0),null);assert.equal(follow.start("",pose(),0),null);
  follow.start("one",pose(),0);follow.stop();assert.equal(follow.id,"");
});

test("real GlobeAircraft display and follow sample the same frame pose without adding another delay",async()=>{
  let source=await readFile(new URL("../components/radar-globe/aircraft.ts",import.meta.url),"utf8");
  for(const name of ["three","three/addons/loaders/GLTFLoader.js","three/addons/utils/BufferGeometryUtils.js"])source=source.replaceAll(JSON.stringify(name),JSON.stringify(import.meta.resolve(name)));
  for(const name of ["radar-aircraft","radar-globe-geodesy","radar-aircraft-motion"])source=source.replaceAll(JSON.stringify(`@/lib/${name}`),JSON.stringify(new URL(`./${name}.ts`,import.meta.url).href));
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const {GlobeAircraft}=await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`),THREE=await import("three");
  const layer=new GlobeAircraft({loadAsync:()=>new Promise(()=>{})}),utc=Date.parse("2026-10-24T12:00:00Z");
  const report=t=>({...pose(),latitude:53+t*.002,timestamp:new Date(utc+t*1000).toISOString()});
  layer.sync([{id:"one",aircraft:"A388",lastSnapshot:report(0),recentSnapshots:[report(-20),report(-10),report(0)]}],"one",0,utc);
  const follow=new AircraftFollow(),initial=follow.start("one",layer.displayedPose("one",0),0);
  const p=layer.displayedPose("one",1000),camera=follow.advance("one",p,initial,1000);
  layer.update(new THREE.Vector3(...geodeticToWorld(camera.latitude,camera.longitude,camera.heightKm*1000)),45,900,1000,new THREE.Frustum());
  const expected=geodeticToWorld(p.latitude,p.longitude,p.altitudeFt*.3048);
  layer.group.children[0].position.toArray().forEach((v,i)=>close(v,expected[i]));
  offset(camera,p).forEach((v,i)=>close(v,[0,.25,.2][i]));layer.dispose();
});

test("website selection exposes camera follow; scene samples before positioning the eye and cleans listeners",async()=>{
  const read=path=>readFile(new URL(path,import.meta.url),"utf8");
  const ui=await read("../components/BaRadarThreeGlobe.tsx"),scene=await read("../components/radar-globe/scene.ts");
  assert.match(ui,/Stop following.*Follow aircraft/);assert.match(ui,/aria-pressed=\{cameraFollow.id===selectedFlight.id\}/);
  assert.match(ui,/selectedFlight&&!props.replay/);assert.match(ui,/globe-follow-change/);assert.match(ui,/removeEventListener\("globe-follow-change"/);
  assert.match(scene,/follow.advance\(id,aircraft.displayedPose\(id,now\)/);
  const render=scene.slice(scene.indexOf("const render = (now:"));
  assert.ok(render.indexOf("sync();")<render.indexOf("follow.advance("));
  assert.ok(render.indexOf("follow.advance(")<render.indexOf("camera.position.set(0, 0, 0)"));
  assert.match(scene,/const moving = followMoving/);assert.match(scene,/if\(key==="escape"\)\{stopFollowing/);
  assert.match(scene,/removeEventListener\("globe-aircraft-follow", toggleFollow\)/);
});
