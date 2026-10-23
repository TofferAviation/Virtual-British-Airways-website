import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
let source=await readFile(new URL("./radar-aurora-magnetic.ts",import.meta.url),"utf8");
for(const name of ["data/wmm2025","radar-globe-geodesy"])source=source.replace(`"./${name}"`,JSON.stringify(new URL(`./${name}.ts`,import.meta.url).href));
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {magneticNorthEastDown,magneticField}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
test("full WMM2025 reproduces NOAA's official geodetic magnetic-field test vectors",async()=>{
  // Official file columns: year, height, latitude, longitude, declination,
  // inclination, H, X(north), Y(east), Z(down), F and secular variations.
  const text=await readFile(new URL("./data/wmm2025-official-test-values.txt",import.meta.url),"utf8");
  const rows=text.split(/\r?\n/).filter(l=>l.trim()&&!l.trim().startsWith("#")).map(l=>l.trim().split(/\s+/).map(Number));
  assert.ok(rows.length>=100);
  for(const row of rows){const [year,height,latitude,longitude]=row;const actual=magneticNorthEastDown(latitude,longitude,height,year);for(const [key,index] of [["north",7],["east",8],["down",9]])assert.ok(Math.abs(actual[key]-row[index])<0.2,`${year}/${latitude}/${longitude}/${height}: ${key} ${actual[key]} != ${row[index]}`);}
});
test("WMM explicitly rejects expired epochs; polar rays remain finite",()=>{
  assert.throws(()=>magneticField(70,20,120,2030));assert.throws(()=>magneticField(70,20,120,2024));for(const latitude of [-90,90])assert.ok(magneticField(latitude,0,120,2026).every(Number.isFinite));
});
