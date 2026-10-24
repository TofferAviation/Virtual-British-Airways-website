import assert from "node:assert/strict";
import test from "node:test";
import {readFile,stat} from "node:fs/promises";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import ts from "typescript";
import {aircraftFrame,aircraftDisplay,aircraftAboveHorizon,flightAltitudeMetres,flightTrackSegments,flightAltitudeColor,resolveAircraftModel} from "./radar-aircraft.ts";
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

test("100% retains readable map size and true metre scale nearby",()=>{
  for(const selected of [true,false]){
    const far=aircraftDisplay(72.72,18000,45,900,selected,1);
    assert.ok(far.mapOverlay);assert.equal(far.highDetail,false);
    assert.ok(Math.abs(far.scale/.001*far.naturalPixels-(selected?44:30))<1e-8);
    const near=aircraftDisplay(72.72,.3,45,900,selected,1);
    assert.equal(near.scale,.001);assert.equal(near.mapOverlay,false);assert.equal(near.highDetail,true);
    for(let range=1;range<20;range+=.01){
      const a=aircraftDisplay(72.72,range,45,900,selected,1),b=aircraftDisplay(72.72,range+.01,45,900,selected,1);
      assert.ok(Math.abs(a.scale-b.scale)<.00003,"no scale jump at either LOD boundary");
    }
  }
});

test("selected close-up boost grows smoothly to 175%, stays bounded and leaves distant/other aircraft unchanged",()=>{
  for(const length of [31.44,37.57,72.72]){
    let previousPixels=Infinity;
    for(let range=.1;range<100;range+=.01){
      const base=aircraftDisplay(length,range,45,900,true,1),display=aircraftDisplay(length,range,45,900,true);
      assert.ok(display.closeBoost>=1&&display.closeBoost<=1.75);
      assert.ok(Math.abs(display.scale/base.scale-display.closeBoost)<1e-9);
      assert.equal(display.mapOverlay,base.mapOverlay,"close-up display boost retains world/cloud depth instead of becoming an always-visible overlay");
      const pixels=display.scale/.001*display.naturalPixels;
      assert.ok(pixels<=previousPixels+1e-8,"aircraft cannot shrink when zooming closer");previousPixels=pixels;
      const other=aircraftDisplay(length,range,45,900,false);
      assert.equal(other.closeBoost,1);
    }
    const close=aircraftDisplay(length,.3,45,900,true),far=aircraftDisplay(length,20,45,900,true);
    assert.equal(close.scale,.00175);assert.equal(close.closeBoost,1.75);assert.equal(far.closeBoost,1);
    for(const edge of [.5,15]){
      const a=aircraftDisplay(length,edge-.0001,45,900,true),b=aircraftDisplay(length,edge+.0001,45,900,true);
      assert.ok(Math.abs(a.closeBoost-b.closeBoost)<1e-8,"smooth blend at both ends");
    }
  }
  assert.equal(aircraftDisplay(72.72,.3,45,900,true,99).closeBoost,2.5);
  assert.equal(aircraftDisplay(72.72,.3,45,900,true,-1).closeBoost,1);
  assert.equal(aircraftDisplay(72.72,.3,45,900,true,NaN).closeBoost,1.75);
});

test("enlarged 3D markers are horizon-culled by real centres, including poles and ground",()=>{
  for(const lat of [-90,-53,0,53,90])for(const lon of [-180,0,170]){
    const camera=geodeticToWorld(lat,lon,400000),near=geodeticToWorld(lat,lon,0),far=geodeticToWorld(-lat,lon===0?180:lon>0?lon-180:lon+180,11000);
    assert.equal(aircraftAboveHorizon(camera,near),true);
    assert.equal(aircraftAboveHorizon(camera,far),false);
  }
});

test("normal map zoom loads matching 3D LODs, not full fleet textures; close-up detail stays physical",async()=>{
  const calls=[],prototypes=[];
  const layer=new GlobeAircraft({async loadAsync(url){
    calls.push(url);const scene=new THREE.Group();scene.add(new THREE.Mesh(new THREE.BoxGeometry(79,20,72),new THREE.MeshStandardMaterial()));
    prototypes.push(scene);return {scene};
  }});
  const flight={id:"one",aircraft:"A388",lastSnapshot:{latitude:53,longitude:-3,altitudeFt:36000,headingDeg:315}};
  layer.sync([flight],"one");
  const centre=new THREE.Vector3(...geodeticToWorld(53,-3,10972.8)),up=new THREE.Vector3(...aircraftFrame(53,-3,0).up);
  const camera=new THREE.PerspectiveCamera(45,1,.0001,40000),frustum=new THREE.Frustum();
  const update=(range,time)=>{
    camera.position.copy(centre).addScaledVector(up,range);camera.lookAt(centre);camera.updateMatrixWorld(true);
    frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    layer.update(camera.position,45,900,time,frustum,1);
  };
  update(400,0);await new Promise(setImmediate);update(400,16);
  assert.deepEqual(calls,["/models/aircraft/lod/a380.glb"]);
  assert.equal(layer.stats.mapModels,1);assert.equal(layer.stats.highDetail,0);
  const root=layer.group.children[0],map=root.children.find(child=>child instanceof THREE.Group&&child.visible);
  assert.ok(map);assert.equal(root.children[0].visible,false,"no flat icon once a supported mesh loads");
  assert.ok(map.children[0].layers.isEnabled(6));assert.equal(map.children[0].layers.isEnabled(5),false,"giant markers never cut cloud depth");
  assert.ok(root.position.distanceTo(centre)<1e-9);
  layer.sync([flight,{...flight,id:"two"}],"one");update(400,32);
  assert.equal(layer.stats.mapModels,2);assert.equal(layer.stats.mapLoaded,1);
  assert.equal(layer.group.children[1].children.at(-1).children[0].geometry,map.children[0].geometry);
  update(.3,400);await new Promise(setImmediate);update(.3,416);
  assert.deepEqual(calls,["/models/aircraft/lod/a380.glb","/models/aircraft/a380.glb"]);
  assert.equal(layer.stats.highDetail,2);assert.equal(layer.stats.detailed,2);
  const full=root.children.find(child=>child instanceof THREE.Group&&child.visible);
  assert.equal(full.scale.x,.001);assert.ok(full.children[0].layers.isEnabled(0));assert.ok(full.children[0].layers.isEnabled(5));
  assert.ok(root.position.distanceTo(centre)<1e-9);
  layer.update(camera.position,45,900,432,frustum,1.75);
  assert.equal(full.scale.x,.00175);assert.ok(full.children[0].layers.isEnabled(5));assert.equal(full.children[0].layers.isEnabled(6),false);
  assert.ok(root.position.distanceTo(centre)<1e-9,"size control cannot move the reported position or altitude");
  assert.equal(layer.stats.loading,0,"changing size reuses the loaded model");
  layer.update(camera.position,45,900,448,frustum,1);
  assert.equal(full.scale.x,.001,"100% restores true size without resetting the camera");
  layer.dispose();assert.equal(layer.group.children.length,0);
});

test("offscreen types do not download and shared map transfers are bounded to two",async()=>{
  const calls=[],finish=[];
  const layer=new GlobeAircraft({loadAsync(url){calls.push(url);return new Promise(resolve=>finish.push(()=>resolve({scene:new THREE.Group()})));}});
  const position={latitude:0,longitude:0,altitudeFt:30000,headingDeg:0};
  const camera=new THREE.PerspectiveCamera(45,1,.01,40000);camera.position.set(0,0,7000);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  layer.sync([{id:"hidden",aircraft:"A388",lastSnapshot:{...position,longitude:180}}],"");
  layer.update(camera.position,45,900,0,frustum);assert.equal(calls.length,0,"no downloads on the far side of Earth");
  layer.sync(["A388","A320","B789","B773"].map((aircraft,i)=>({id:String(i),aircraft,lastSnapshot:position})),"0");
  layer.update(camera.position,45,900,400,frustum);assert.equal(calls.length,2);assert.equal(layer.stats.loading,2);
  layer.dispose();finish.forEach(done=>done());await new Promise(setImmediate);
  assert.equal(layer.stats.mapLoaded,0,"pending loads cannot repopulate a disposed viewer");
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

test("each supported type has a small single-draw 3D map mesh derived from its own airframe",async()=>{
  const manifest=JSON.parse(await read("public/models/aircraft/manifest.json")),lods=JSON.parse(await read("public/models/aircraft/lod/manifest.json"));
  assert.equal(lods.models.length,manifest.models.length);assert.equal(lods.revision,manifest.revision);
  assert.ok(lods.models.reduce((n,m)=>n+m.bytes,0)<2.5*1024**2);
  for(const model of manifest.models){
    const bytes=await readFile(new URL(`public/models/aircraft/lod/${model.file}`,root));
    assert.equal(bytes.toString("ascii",0,4),"glTF");assert.equal(bytes.readUInt32LE(4),2);
    const g=JSON.parse(bytes.toString("utf8",20,20+bytes.readUInt32LE(12))),p=g.meshes[0].primitives[0];
    assert.equal(g.meshes.length,1);assert.equal(g.meshes[0].primitives.length,1);assert.equal(g.materials.length,1);
    assert.equal(g.images,undefined);assert.equal(g.buffers[0].uri,undefined);
    assert.equal(g.extras.source,`../${model.file}`);assert.equal(g.extras.license,"GPL-2.0");
    assert.ok(g.accessors[p.indices].count/3<=12000);
    assert.ok(p.attributes.NORMAL!==undefined&&p.attributes.COLOR_0!==undefined);
    const spec=resolveAircraftModel(model.type),positions=g.accessors[p.attributes.POSITION];
    assert.ok((positions.max[2]-positions.min[2])>spec.lengthM*.8);
    assert.ok((positions.max[0]-positions.min[0])>spec.spanM*.75);
  }
  assert.equal(await read("scripts/bake-aircraft-lods.mjs"),await read("public/models/aircraft/source/bake-aircraft-lods.mjs"));
});
test("live/replay integration has no cone or fixed flight height and exports altitude",async()=>{
  const source=await read("src/components/radar-globe/scene.ts");
  assert.doesNotMatch(source,/ConeGeometry|Math\.max\(15000|longitude, 16000/);
  assert.match(source,/aircraft\.sync\(flightModels/);assert.match(source,/addTrack\(state\.replay/);
  assert.match(source,/globe-aircraft-view/);assert.match(source,/aircraftDepthMaterial/);
  const live=await read("src/lib/radar-live.ts");assert.match(live,/onGround: snapshot\.onGround, altitudeFt: snapshot\.altitudeFt/);
  assert.doesNotMatch(source,/traffic-fixture|TRAFFIC_FIXTURE/);
});
