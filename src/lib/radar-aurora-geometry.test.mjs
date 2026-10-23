import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import * as THREE from "three";
import {worldToGeodetic} from "./radar-globe-geodesy.ts";
async function moduleUrl(relative,replace){let source=await readFile(new URL(relative,import.meta.url),"utf8");for(const [from,to] of Object.entries(replace))source=source.replace(JSON.stringify(from),JSON.stringify(to));return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString("base64")}`;}
const magnetic=await moduleUrl("./radar-aurora-magnetic.ts",{"./data/wmm2025":new URL("./data/wmm2025.ts",import.meta.url).href,"./radar-globe-geodesy":new URL("./radar-globe-geodesy.ts",import.meta.url).href});
const url=await moduleUrl("../components/radar-globe/aurora.ts",{"three":import.meta.resolve("three"),"@/lib/radar-aurora-field":new URL("./radar-aurora-field.ts",import.meta.url).href,"@/lib/radar-globe-geodesy":new URL("./radar-globe-geodesy.ts",import.meta.url).href,"@/lib/radar-aurora-magnetic":magnetic});
const {buildAuroraCurtains,updateAuroraCurtains}=await import(url);
const data=(shift=0)=>({source:"NOAA SWPC OVATION Prime",observedAt:"2026-10-23T12:00:00Z",forecastAt:"2026-10-23T12:30:00Z",refreshedAt:"2026-10-23T12:00:00Z",samples:Array.from({length:360*10},(_,i)=>({longitude:Math.floor(i/10),latitude:i%10<5?66+i%5+shift:-73+i%5-shift,probability:70}))});
test("actual curtain geometry has physical WGS84 heights, a closed seam and bounded mesh resources",()=>{
  const material=new THREE.ShaderMaterial();
  for(const quality of ["low","balanced","high"]){const group=buildAuroraCurtains(data(),material,quality);assert.equal(group.children.length,8);let bytes=0;
    for(const mesh of group.children){const position=mesh.geometry.getAttribute("position"), {columns,rows}=mesh.userData;
      for(let col=0;col<=columns;col+=Math.max(1,Math.floor(columns/12)))for(const row of [0,Math.floor(rows/2),rows]){const i=col*(rows+1)+row,geo=worldToGeodetic([position.getX(i),position.getY(i),position.getZ(i)]);assert.ok(Math.abs(geo.heightMetres-(95000+row/rows*355000))<1);}
      for(let row=0;row<=rows;row++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(position.array[row*3+axis]-position.array[(columns*(rows+1)+row)*3+axis])<.001,"dateline seam");
      for(const a of Object.values(mesh.geometry.attributes))bytes+=a.array.byteLength;bytes+=mesh.geometry.index.array.byteLength;
    }
    assert.ok(bytes<16*1024*1024,`${quality} exceeded 16 MiB: ${bytes}`);group.children.forEach(m=>m.geometry.dispose());
  }material.dispose();
});
test("forecast morph reuses geometry/buffers, retaining an exact in-progress endpoint",()=>{
  const material=new THREE.ShaderMaterial(),group=buildAuroraCurtains(data(),material,"low"),mesh=group.children[0],geometry=mesh.geometry,from=geometry.getAttribute("position"),to=geometry.getAttribute("aNextPosition"),original=from.array.slice();
  updateAuroraCurtains(group,data(2),1);assert.equal(mesh.geometry,geometry);assert.equal(geometry.getAttribute("position"),from);assert.equal(geometry.getAttribute("aNextPosition"),to);assert.deepEqual(from.array,original);assert.notDeepEqual(to.array,original);
  const endpoint=to.array.slice();updateAuroraCurtains(group,data(3),.5);for(let i=0;i<from.array.length;i+=131)assert.ok(Math.abs(from.array[i]-(original[i]+endpoint[i])/2)<.001);
  group.children.forEach(m=>m.geometry.dispose());material.dispose();
});
