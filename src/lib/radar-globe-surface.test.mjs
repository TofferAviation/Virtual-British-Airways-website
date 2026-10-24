import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as THREE from "three";
import { GLOBE_PROFILES } from "./radar-globe-quality.ts";
import { geodeticToWorld, geodeticNormal, worldToGeodetic, geographicTileBounds, WGS84_A_KM, WGS84_B_KM } from "./radar-globe-geodesy.ts";

// Execute the actual tile scheduler with Three geometry/frustum math. Only
// network/bitmap decoding is replaced; no WebGL context or GPU is simulated.
const sourceUrl = new URL("../components/radar-globe/surface.ts", import.meta.url);
let source = await readFile(sourceUrl, "utf8");
source = source.replace('"three"', JSON.stringify(import.meta.resolve("three")));
for (const name of ["radar-globe-geodesy", "radar-globe-quality", "radar-globe-elevation"])
  source = source.replace(`"@/lib/${name}"`, JSON.stringify(new URL(`./${name}.ts`, import.meta.url).href));
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { GlobeSurface, geographicPatch } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("ocean normals remain geodetic across DEM tile edges, skirts and LODs; relief retains slopes",()=>{
  for(const z of [4,8,11]){
    const x=2**z,y=2**(z-1),b=geographicTileBounds(z,x,y),geometry=geographicPatch(z,x,y,new Float32Array(65*65));
    const normals=geometry.getAttribute("normal");
    for(const [row,col]of [[0,0],[0,64],[32,32],[64,0],[64,64]]){
      const expected=geodeticNormal(b.north-(b.north-b.south)*row/64,b.west+(b.east-b.west)*col/64);
      assert.ok(new THREE.Vector3().fromBufferAttribute(normals,row*65+col).distanceTo(new THREE.Vector3(...expected))<1e-6);
    }
    geometry.dispose();
  }
  const slope=Float32Array.from({length:65*65},(_,i)=>(i%65)*20),geometry=geographicPatch(11,2048,1024,slope);
  const b=geographicTileBounds(11,2048,1024),up=new THREE.Vector3(...geodeticNormal((b.north+b.south)/2,(b.west+b.east)/2));
  const normal=new THREE.Vector3().fromBufferAttribute(geometry.getAttribute("normal"),32*65+32);
  assert.ok(normal.distanceTo(up)>.05);assert.ok(Math.abs(normal.length()-1)<1e-6);geometry.dispose();
});

test("actual terrain scheduler bounds memory/requests, refines near terrain and never overlaps parent/child", async () => {
  const originalFetch = globalThis.fetch, originalBitmap = globalThis.createImageBitmap;
  const pending = new Set();
  let active = 0, peak = 0, closed = 0;
  globalThis.fetch = (url, { signal }) => new Promise((resolve, reject) => {
    active++; peak = Math.max(peak, active);
    const finish = () => {
      if (!pending.delete(finish)) return;
      active--;
      resolve(String(url).includes("/elevation?")?new Response(new Float32Array(65*65).fill(100).buffer,{headers:{"X-Elevation-Grid":"65"}}):new Response(new Blob([String(url)]), { headers: { "Content-Type": "image/jpeg" } }));
    };
    pending.add(finish);
    signal.addEventListener("abort", () => {
      if (!pending.delete(finish)) return;
      active--; reject(new Error("aborted"));
    }, { once: true });
  });
  globalThis.createImageBitmap = async (blob,options={}) => {
    const size = options.resizeWidth??(blob instanceof Blob?(await blob.text()).includes("blue-marble")?1024:512:blob.width);
    return { width: size, height: size, close() { closed++; } };
  };
  const surface = new GlobeSurface((texture, night) => new THREE.ShaderMaterial({ uniforms: { uSurface: { value: texture }, uNight: { value: night } } }), 8);
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 1, 20000);
  const sun = new THREE.Vector3(0, 0, 1);
  const update = (latitude = 51.5, longitude = -0.12, heightMetres = 12000, groundIntent = false, pitch = 30) => {
    camera.near = 0.0002;camera.updateProjectionMatrix();
    camera.position.set(...geodeticToWorld(latitude, longitude, heightMetres));
    camera.lookAt(0, 0, 0); camera.rotateX(pitch*Math.PI/180); camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    surface.update(camera.position, 1080, camera.fov, frustum, sun, false, groundIntent);
    for (const tile of surface.tiles.values()) if (tile.mesh.visible) {
      for (let parent = tile.parent; parent; parent = parent.parent) assert.equal(parent.mesh.visible, false, "overlapping ancestor");
    }
  };
  const drain = async () => { [...pending].forEach(resolve => resolve()); await new Promise(resolve => setImmediate(resolve)); };
  const checkCoverage = () => {
    const radii = new THREE.Vector3(WGS84_A_KM, WGS84_B_KM, WGS84_A_KM);
    for (const x of [-0.95, 0, 0.95]) for (const y of [-0.95, 0, 0.95]) {
      const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const scaled = new THREE.Ray(raycaster.ray.origin.clone().divide(radii), raycaster.ray.direction.clone().divide(radii).normalize());
      const hit = scaled.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
      if (!hit) continue;
      const geo = worldToGeodetic(hit.multiply(radii).toArray());
      assert.ok([...surface.tiles.values()].some(tile => {
        if (!tile.mesh.visible) return false;
        const b = geographicTileBounds(tile.z, tile.x, tile.y);
        return geo.latitude >= b.south && geo.latitude <= b.north && geo.longitude >= b.west && geo.longitude <= b.east;
      }), `hole at view ${x},${y} / ${JSON.stringify(geo)}`);
    }
  };
  try {
    surface.setQuality("low");
    for (let i = 0; i < 100; i++) { await drain(); update(); }
    assert.ok(peak <= 2, `Low started ${peak} concurrent requests`);
    assert.ok(surface.stats.imageryMb <= GLOBE_PROFILES.low.cacheMb + 0.1, JSON.stringify(surface.stats));
    assert.ok(surface.tiles.size <= GLOBE_PROFILES.low.maxTiles);
    assert.ok(surface.stats.level >= 6, `never reached useful close-up detail: ${JSON.stringify({...surface.stats,nodes:surface.tiles.size,levels:[...surface.tiles.values()].filter(t=>t.z>=5).map(t=>({id:`${t.z}/${t.x}/${t.y}`,ready:t.ready,borrowed:t.borrowed,dem:!!t.elevation,image:!!t.dayTexture,touched:t.touched,visible:t.mesh.visible,demRetry:t.elevationRetryAt,retry:t.retryAt}))})}`);
    checkCoverage();
    for(let i=0;i<100;i++){await drain();update(51.5,-0.12,60000,true,88);}
    const prefetched=surface.heightAt(51.5,-.12);
    assert.ok(prefetched.ready,`collision detail must prefetch at 60 km: ${JSON.stringify({stats:surface.stats,nodes:surface.tiles.size,ground:prefetched})}`);
    for(let i=0;i<100;i++){await drain();update(51.5,-0.12,9100,true);}
    const ground=surface.heightAt(51.5,-0.12);
    assert.ok(ground.ready,`Low could not finish the ground DEM: ${JSON.stringify(surface.stats)}`);
    assert.equal(ground.heightKm,0.1);
    for(let i=0;i<50;i++){await drain();update(51.5,-0.12,105,true);}
    assert.ok(surface.stats.imageryMb<=GLOBE_PROFILES.low.cacheMb+0.1);
    surface.setQuality("high");
    for (let i = 0; i < 80; i++) { await drain(); update(); }
    assert.ok(surface.stats.level >= 9, `HD terrain not reached: ${JSON.stringify(surface.stats)}`);
    checkCoverage();
    surface.setQuality("low");
    for (let i = 0; i < 25; i++) { await drain(); update(i % 2 ? 51.5 : -33.9, i % 2 ? -0.12 : 151.2); }
    await drain(); update();
    assert.ok(surface.stats.imageryMb <= GLOBE_PROFILES.low.cacheMb + 0.1, JSON.stringify(surface.stats));
    assert.ok(surface.tiles.size <= GLOBE_PROFILES.low.maxTiles);
    assert.ok(peak <= 4, `High started ${peak} requests`);
    assert.ok([...surface.tiles.values()].every(t=>t.elevationRetryAt===0),"cancelled obsolete DEM work must not impose a 30-second retry lock");
    surface.dispose(); await drain();
    assert.equal(active, 0); assert.equal(surface.tiles.size, 0); assert.ok(closed > 0);
  } finally {
    surface.dispose(); globalThis.fetch = originalFetch; globalThis.createImageBitmap = originalBitmap;
  }
});
