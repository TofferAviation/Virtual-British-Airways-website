import assert from "node:assert/strict";
import test from "node:test";
import {readFile,stat} from "node:fs/promises";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import ts from "typescript";
import {aircraftFrame,flightAltitudeMetres,flightTrackSegments,flightAltitudeColor,resolveAircraftModel} from "./radar-aircraft.ts";
import {worldToGeodetic,geodeticToWorld} from "./radar-globe-geodesy.ts";

const root=new URL("../../",import.meta.url);
const read=path=>readFile(new URL(path,root),"utf8");
async function component(path){
  let source=await read(path);
  for(const name of ["three","three/addons/loaders/GLTFLoader.js","three/addons/utils/BufferGeometryUtils.js"])source=source.replaceAll(JSON.stringify(name),JSON.stringify(import.meta.resolve(name)));
  for(const name of ["radar-aircraft","radar-globe-geodesy"])source=source.replaceAll(JSON.stringify(`@/lib/${name}`),JSON.stringify(new URL(`./${name}.ts`,import.meta.url).href));
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const {GlobeAircraft,prepareAircraftModel}=await component("src/components/radar-globe/aircraft.ts");
const {flightTrackGeometry}=await component("src/components/radar-globe/flight-track.ts");

test("ICAO and human-readable aircraft names match types; substitutes and unknowns are honest",()=>{
  for(const name of ["A388","Airbus A380-800","A380"])assert.equal(resolveAircraftModel(name).key,"a380");
  assert.equal(resolveAircraftModel("Boeing 787-9").key,"b789");
  assert.equal(resolveAircraftModel("Boeing 777-300ER").match,"family");
  assert.equal(resolveAircraftModel("A20N").key,"a320");
  assert.equal(resolveAircraftModel("A20N").match,"family");
  for(const name of ["A35K","Airbus A350-1000","Boeing 787-10","unknown",""])assert.equal(resolveAircraftModel(name),null,name);
});
test("reported flight altitude is not raised to 15 km, clamped to cruise or invented",()=>{
  assert.ok(Math.abs(flightAltitudeMetres({altitudeFt:36000})-10972.8)<1e-8);
  assert.equal(flightAltitudeMetres({altitudeFt:0}),0);
  assert.ok(Math.abs(flightAltitudeMetres({altitudeFt:-100})+30.48)<1e-8);
  for(const altitudeFt of [undefined,null,NaN,Infinity])assert.equal(flightAltitudeMetres({altitudeFt}),null);
});
test("heading uses orthonormal right/up/back axes at equator, UK, poles and dateline",()=>{
  for(const latitude of [-90,-53,0,53,90])for(const longitude of [-180,0,170])for(const heading of [0,90,180,270]){
    const frame=aircraftFrame(latitude,longitude,heading),right=new THREE.Vector3(...frame.right),up=new THREE.Vector3(...frame.up),back=new THREE.Vector3(...frame.back);
    assert.ok(Math.abs(right.length()-1)<1e-12);assert.ok(Math.abs(right.dot(up))<1e-12);
    assert.ok(right.clone().cross(up).distanceTo(back)<1e-12);
  }
  const north=aircraftFrame(0,0,0),east=aircraftFrame(0,0,90);
  assert.ok(new THREE.Vector3(...north.back).negate().distanceTo(new THREE.Vector3(0,1,0))<1e-12);
  assert.ok(new THREE.Vector3(...east.back).negate().distanceTo(new THREE.Vector3(1,0,0))<1e-12);
});
test("track follows measured climb and crosses the dateline the short way",()=>{
  const [points]=flightTrackSegments([{latitude:0,longitude:179,altitudeFt:1000},{latitude:0,longitude:-179,altitudeFt:36000}]);
  assert.ok(points.length>2&&points.length<=41);
  assert.ok(points.every(p=>Math.abs(p.longitude)>=179));
  assert.equal(points[0].altitudeFt,1000);assert.equal(points.at(-1).altitudeFt,36000);
  assert.ok(points.slice(1).every((p,i)=>p.altitudeFt>=points[i].altitudeFt));
  assert.equal(flightTrackSegments([{latitude:0,longitude:0,altitudeFt:100},{latitude:1,longitude:1},{latitude:2,longitude:2,altitudeFt:200}]).length,0);
});
test("altitude ribbon top is the recorded flight level, bottom is the reference surface",()=>{
  const [{line,ribbon}]=flightTrackGeometry([{latitude:51.47,longitude:-.46,altitudeFt:300},{latitude:53,longitude:-3,altitudeFt:36000}]);
  const points=line.getAttribute("position");
  for(const [index,height] of [[0,91.44],[points.count-1,10972.8]])assert.ok(Math.abs(worldToGeodetic([points.getX(index),points.getY(index),points.getZ(index)]).heightMetres-height)<1);
  assert.ok(ribbon.getAttribute("position").count>0);
  assert.deepEqual(flightAltitudeColor(0),[.3,.95,.15]);
  assert.notDeepEqual(flightAltitudeColor(0),flightAltitudeColor(36000));
  line.dispose();ribbon.dispose();
});
test("aircraft instances reuse geometry, stay at telemetry height, and disappear cleanly",()=>{
  const layer=new GlobeAircraft(),flight={id:"one",aircraft:"Airbus A380-800",lastSnapshot:{latitude:53,longitude:-3,altitudeFt:36000,headingDeg:315}};
  layer.sync([flight],"one");const first=layer.group.children[0],geometry=first.children[0].geometry;
  assert.ok(first.position.distanceTo(new THREE.Vector3(...geodeticToWorld(53,-3,10972.8)))<1e-9);
  layer.sync([flight],"one");assert.equal(layer.group.children[0],first);assert.equal(first.children[0].geometry,geometry);
  assert.equal(layer.stats.loading,0,"no eager fleet downloads");
  layer.sync([],"");assert.equal(layer.group.children.length,0);layer.dispose();
});
test("static model batching preserves transformed bounds, merges shared materials and includes cloud depth",()=>{
  const source=new THREE.Group(),material=new THREE.MeshStandardMaterial(),geometry=new THREE.BoxGeometry(2,2,4);
  for(const x of [-5,5]){const part=new THREE.Mesh(geometry,material);part.position.set(x,4,8);source.add(part);}
  const model=prepareAircraftModel(source),bounds=new THREE.Box3().setFromObject(model);
  assert.equal(model.children.length,1);assert.ok(bounds.getSize(new THREE.Vector3()).distanceTo(new THREE.Vector3(12,2,4))<1e-8);
  assert.ok(bounds.getCenter(new THREE.Vector3()).length()<1e-8);assert.ok(model.children[0].layers.isEnabled(5));
  model.children[0].geometry.dispose();material.dispose();
});
test("all shipped assets are glTF 2.0 with self-contained resources and corresponding editable sources",async()=>{
  const manifest=JSON.parse(await read("public/models/aircraft/manifest.json"));
  assert.equal(manifest.models.length,14);
  for(const model of manifest.models){
    const bytes=await readFile(new URL(`public/models/aircraft/${model.file}`,root));
    assert.equal(bytes.toString("ascii",0,4),"glTF");assert.equal(bytes.readUInt32LE(4),2);
    const gltf=JSON.parse(bytes.toString("utf8",20,20+bytes.readUInt32LE(12)));
    assert.equal(gltf.asset.version,"2.0");
    for(const resource of [...gltf.buffers??[],...gltf.images??[]])assert.ok(!resource.uri||resource.uri.startsWith("data:"),`${model.type}: external dependency`);
    assert.ok(model.sourceFiles.some(f=>f.endsWith(".blend")));
    for(const file of model.sourceFiles)assert.ok((await stat(new URL(`public/models/aircraft/source/${model.type}/${file}`,root))).size>0);
  }
  assert.match(await read("public/models/aircraft/LICENSE.txt"),/GNU GENERAL PUBLIC LICENSE/);
  assert.match(await read("public/models/aircraft/NOTICE.md"),/WITHOUT/);
});
test("the actual fleet geometry parses in Three.js and batches without changing bounds",async()=>{
  // No browser/WebGL is used: remove texture references from an in-memory copy
  // solely to exercise actual geometry/scene transforms in the runtime loader.
  const OriginalProgressEvent=globalThis.ProgressEvent;
  globalThis.ProgressEvent??=class ProgressEvent{constructor(type,options){this.type=type;Object.assign(this,options);}};
  try{
    const manifest=JSON.parse(await read("public/models/aircraft/manifest.json"));
    for(const model of manifest.models){
      const bytes=await readFile(new URL(`public/models/aircraft/${model.file}`,root)),jsonLength=bytes.readUInt32LE(12);
      const gltf=JSON.parse(bytes.toString("utf8",20,20+jsonLength)),binStart=20+jsonLength+8;
      gltf.buffers[0].uri=`data:application/octet-stream;base64,${bytes.subarray(binStart).toString("base64")}`;
      delete gltf.images;delete gltf.textures;delete gltf.samplers;
      gltf.materials=(gltf.materials??[]).map(m=>({name:m.name,pbrMetallicRoughness:{baseColorFactor:m.pbrMetallicRoughness?.baseColorFactor},doubleSided:m.doubleSided}));
      const {scene}=await new GLTFLoader().parseAsync(JSON.stringify(gltf),"");
      const originalBounds=new THREE.Box3().setFromObject(scene,true),batched=prepareAircraftModel(scene);
      const bounds=new THREE.Box3().setFromObject(batched,true);
      assert.ok(originalBounds.getSize(new THREE.Vector3()).distanceTo(bounds.getSize(new THREE.Vector3()))<.001,`${model.type}: ${originalBounds.getSize(new THREE.Vector3()).toArray()} -> ${bounds.getSize(new THREE.Vector3()).toArray()}`);
      assert.ok(bounds.getCenter(new THREE.Vector3()).length()<.001,model.type);
      const dimensions=bounds.getSize(new THREE.Vector3()),spec=resolveAircraftModel(model.type);
      assert.ok(dimensions.z>spec.lengthM*.8&&dimensions.z<spec.lengthM*1.2,`${model.type}: metre-scaled forward axis (${dimensions.z} m)`);
      assert.ok(dimensions.x>spec.spanM*.75&&dimensions.x<spec.spanM*1.25,`${model.type}: metre-scaled wingspan (${dimensions.x} m)`);
      assert.ok(batched.children.length>0&&batched.children.length<100,`${model.type}: bounded material batches`);
      batched.traverse(mesh=>{if(mesh instanceof THREE.Mesh){mesh.geometry.dispose();for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])m.dispose();}});
    }
  }finally{if(OriginalProgressEvent)globalThis.ProgressEvent=OriginalProgressEvent;else delete globalThis.ProgressEvent;}
});
test("live/replay integration has no cone or fixed flight height and exports altitude",async()=>{
  const source=await read("src/components/radar-globe/scene.ts");
  assert.doesNotMatch(source,/ConeGeometry|Math\.max\(15000|longitude, 16000/);
  assert.match(source,/aircraft\.sync\(flightModels/);assert.match(source,/addTrack\(state\.replay/);
  assert.match(source,/globe-aircraft-view/);assert.match(source,/aircraftDepthMaterial/);
  const live=await read("src/lib/radar-live.ts");assert.match(live,/onGround: snapshot\.onGround, altitudeFt: snapshot\.altitudeFt/);
  assert.doesNotMatch(source,/traffic-fixture|TRAFFIC_FIXTURE/);
});
