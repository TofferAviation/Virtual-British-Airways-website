import assert from "node:assert/strict";
import test from "node:test";
import { readFile, stat } from "node:fs/promises";
import ts from "typescript";
import { auroraKpOverride } from "./radar-aurora-kp.ts";

const root = new URL("../../", import.meta.url);
const read = path => readFile(new URL(path,root),"utf8");
const settingsSource = (await read("src/lib/radar-globe-settings.ts")).replace('"./radar-aurora-motion"',JSON.stringify(new URL("./radar-aurora-motion.ts",import.meta.url).href));
const compiled = ts.transpileModule(settingsSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createGlobeAuroraSettings,createGlobeCloudSettings}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("website and QA defaults retain the accepted look without enabling simulations",()=>{
  const aurora=createGlobeAuroraSettings(),clouds=createGlobeCloudSettings();
  assert.equal(aurora.animationSpeed,.3);
  assert.equal(aurora.quality,"auto");
  assert.equal(aurora.photoMode,false);
  assert.equal(auroraKpOverride(aurora),null);
  assert.equal(aurora.debug,"off");
  assert.equal(aurora.hemisphere,"both");
  assert.equal(clouds.quality,"auto");
  assert.equal(clouds.opacity,.65);
  for(const key of ["low","middle","high","selfShadows","realWorld"])assert.equal(clouds[key],true);
  aurora.kpOverrideEnabled=true;aurora.photoMode=true;clouds.opacity=.2;
  assert.equal(createGlobeAuroraSettings().kpOverrideEnabled,false);
  assert.equal(createGlobeAuroraSettings().photoMode,false);
  assert.equal(createGlobeCloudSettings().opacity,.65);
});

test("live map wires traffic/replay/camera to the shared renderer, never the QA fixtures",async()=>{
  const source=await read("src/components/PublicBaRadar.tsx");
  const ast=ts.createSourceFile("PublicBaRadar.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const globes=[];
  const visit=node=>{if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==="BaRadarGlobe")globes.push(node);ts.forEachChild(node,visit);};
  visit(ast);
  assert.equal(globes.length,1);
  const props=new Set(globes[0].attributes.properties.map(p=>p.name?.getText(ast)));
  for(const name of ["flights","selectedId","onSelect","controllers","onSelectController","replay","aurora","auroraSettings","cloudData","cloudSettings","initialCamera","onCameraChange","compactControls"])assert.ok(props.has(name),name);
  assert.ok([...props].every(name=>!name?.startsWith("test")),"QA Sun/weather/camera fixtures cannot leak into production");
  assert.match(source,/import\("@\/components\/BaRadarThreeGlobe"\)/);
  assert.doesNotMatch(source,/import\("@\/components\/BaRadarGlobe"\)/);
  const qa=await read("src/components/radar-globe/visual-check.tsx");
  for(const text of [source,qa])for(const factory of ["createGlobeAuroraSettings","createGlobeCloudSettings"])assert.ok(text.includes(factory));
  const devRoute=await read("src/app/dev/globe/page.tsx");
  assert.match(devRoute,/NODE_ENV === "production"\) notFound\(\)/);
});

test("production ships the cloud volumes and imagery/terrain/feed routes without the QA server",async()=>{
  for(const [asset,bytes]of [["mass-v1.rgba",64**3*4],["detail-v1.rgba",32**3*4]])assert.equal((await stat(new URL(`public/textures/clouds/${asset}`,root))).size,bytes);
  for(const route of ["aurora","clouds","elevation","imagery"])assert.ok((await stat(new URL(`src/app/api/radar/${route}/route.ts`,root))).isFile());
});
