import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {gzipSync} from "node:zlib";
import {FORECAST_PROFILES,forecastPressureHeight,sampleForecastGrid,validateForecastCloudData,FORECAST_MAX_AGE_MS} from "./radar-cloud-forecast.ts";
import {decodeForecastFeed,fetchForecastFeed,FORECAST_FEED_MAX_BYTES} from "./radar-cloud-forecast-feed.ts";
import {forecastCandidates} from "../../scripts/ingest-forecast-clouds.mjs";
import {forecastCloudAppearanceGLSL} from "../components/radar-globe/forecast-cloud-appearance.ts";

const now=Date.parse("2026-10-24T12:10:00Z"),width=1440,height=720;
// Explicitly synthetic contract fixture; no test artifact is served in production.
const bytes=Buffer.alloc(width*height*4);for(let i=0;i<bytes.length;i+=4)bytes.set([180,12,40,255],i);
const volume=bytes.toString("base64");
function fixture(){return {source:"NOAA GFS",forecast:{mode:"global-forecast",model:"GFS",forecastHour:6,sourceUrl:"https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.20261024/06/atmos/gfs.t06z.pgrb2.0p25.f006",layerBounds:"time-averaged-pressure-interpolated-height"},sourceResolutionDeg:.25,displayResolutionDeg:.25,cycleAt:"2026-10-24T06:00:00Z",validAt:"2026-10-24T12:00:00Z",fetchedAt:"2026-10-24T12:05:00Z",stale:false,width,height,west:-180,north:90,stepDeg:.25,encoding:"rgba8-base64",fields:FORECAST_PROFILES.flatMap(p=>[`${p.coverageField}:${p.id} cloud layer`,`PRES:${p.id} cloud bottom level`,`PRES:${p.id} cloud top level`]),layers:FORECAST_PROFILES.map(p=>({...p,volume}))};}

test("forecast cloud bounds interpolate model geopotential height in log pressure, never fixed global ceilings",()=>{
  const levels=[[100000,100],[85000,1500],[70000,3000],[50000,5600],[30000,9200],[10000,16000]];
  assert.equal(forecastPressureHeight(85000,levels),1500);
  assert.ok(Math.abs(forecastPressureHeight(Math.sqrt(85000*70000),levels)-2250)<1e-8);
  assert.ok(forecastPressureHeight(104000,levels)<100,"bounded low-pressure-level extrapolation supports sea-level fog");
  for(const p of [NaN,0,9000,111000])assert.equal(forecastPressureHeight(p,levels),null);
  assert.equal(forecastPressureHeight(90000,[[100000,2000],[85000,1000]]),null);
});
test("forecast resampling uses cell centres and wraps longitude without duplicate dateline or polar rows",()=>{
  const values=[0,10,20,30,100,110,120,130,200,210,220,230];
  assert.equal(sampleForecastGrid(values,4,3,.5,.5),55);
  assert.equal(sampleForecastGrid(values,4,3,3.5,.5),65);
  assert.equal(sampleForecastGrid(values,4,3,-.5,.5),65);
  assert.equal(sampleForecastGrid(values,4,3,.5,1.5),155);
  const missing=[...values];missing[0]=NaN;assert.ok(Number.isNaN(sampleForecastGrid(missing,4,3,.5,.5)));
});
test("forecast source candidates use recent actual cycles and a near-current forecast hour",()=>{
  const candidates=forecastCandidates(new Date("2026-10-24T13:37:00Z"));
  assert.deepEqual(candidates.map(x=>x.forecastHour),[1,7,13]);
  assert.ok(candidates[0].url.endsWith("/12/atmos/gfs.t12z.pgrb2.0p25.f001"));
  assert.equal(candidates.length,3);
});
test("global model contract requires separate provenance and valid worldwide layer textures",()=>{
  const data=fixture();assert.equal(validateForecastCloudData(data,now),data);
  for(const lon of [-100,0,110,179.9]){const i=(360*width+Math.floor((lon+180)/.25))*4;assert.equal(Buffer.from(data.layers[0].volume,"base64")[i+3],255);}
  assert.throws(()=>validateForecastCloudData({...data,source:"NOAA GOES ABI"},now));
  assert.throws(()=>validateForecastCloudData({...data,satellite:{}},now));
  assert.throws(()=>validateForecastCloudData({...data,forecast:undefined},now));
  assert.throws(()=>validateForecastCloudData({...data,width:1439},now));
  assert.throws(()=>validateForecastCloudData({...data,fields:[]},now));
  assert.throws(()=>validateForecastCloudData({...data,unexpectedPrivateField:"not-weather"},now));
  assert.throws(()=>validateForecastCloudData({...data,forecast:{...data.forecast,sourceUrl:data.forecast.sourceUrl.replace("f006","f007")}},now));
});
test("stale, future, malformed or inverted forecast columns cannot become replacement weather",()=>{
  const data=fixture();assert.throws(()=>validateForecastCloudData(data,Date.parse(data.validAt)+FORECAST_MAX_AGE_MS+1));
  assert.throws(()=>validateForecastCloudData({...data,stale:true},now));
  assert.throws(()=>validateForecastCloudData({...data,validAt:"2026-10-24T18:00:00Z"},now));
  assert.throws(()=>validateForecastCloudData({...data,layers:data.layers.slice(0,2)},now));
  const bad=Buffer.from(bytes);bad[2]=1;
  assert.throws(()=>validateForecastCloudData({...data,layers:[{...data.layers[0],volume:bad.toString("base64")},...data.layers.slice(1)]},now));
  bad.set([0,0,0,255],0);assert.doesNotThrow(()=>validateForecastCloudData({...data,layers:[{...data.layers[0],volume:bad.toString("base64")},...data.layers.slice(1)]},now));
});
test("hosted forecast feed is bounded, validated and cannot masquerade as the observed feed",async()=>{
  const data=fixture(),packed=gzipSync(Buffer.from(JSON.stringify(data)));
  assert.equal(decodeForecastFeed(packed,now).forecast.mode,"global-forecast");
  assert.equal((await fetchForecastFeed(async()=>new Response(packed),now)).layers.length,3);
  assert.throws(()=>decodeForecastFeed(Buffer.alloc(FORECAST_FEED_MAX_BYTES+1),now));
  assert.throws(()=>decodeForecastFeed(gzipSync(Buffer.from('{"source":"NOAA GOES ABI"}')),now));
  await assert.rejects(()=>fetchForecastFeed(async()=>new Response(null,{status:503}),now));
});
test("explicit source switch never injects global forecast coverage into satellite Live",async()=>{
  const read=path=>readFile(new URL(path,import.meta.url),"utf8");
  const api=await read("../app/api/radar/clouds/route.ts"),scene=await read("../components/radar-globe/scene.ts"),ui=await read("../components/PublicBaRadar.tsx");
  assert.match(api,/searchParams.get\("mode"\)\?\?"satellite"/);
  assert.match(api,/mode==="forecast"\?getForecastCloudData\(\):getRadarCloudData\(\)/);
  assert.match(api,/cachedTransport\.get\(mode\)/);
  assert.match(scene,/d\.forecast\?\.mode==="global-forecast"/);
  assert.match(scene,/shared\.uSatelliteMode\.value=1/);
  assert.match(scene,/forecastPixels.clear\(\);forecastValidUntil=0/);
  assert.match(ui,/GLOBAL FORECAST/);assert.match(ui,/not satellite observations/i);
  assert.match(ui,/setCloudData\(null\);setCloudError\(null\)/);
});
test("forecast billows use stable 3D masses and filtered edge erosion, sharing sunlight/ground-shadow integration",async()=>{
  assert.match(forecastCloudAppearanceGLSL,/float canopy=/);
  assert.match(forecastCloudAppearanceGLSL,/float deck=/);
  assert.match(forecastCloudAppearanceGLSL,/volume\/scale/);
  assert.match(forecastCloudAppearanceGLSL,/fineDetail&&margin<0.20/);
  assert.doesNotMatch(forecastCloudAppearanceGLSL,/uTime|Math.random|fract\(uv\*/);
  const shader=await readFile(new URL("../components/radar-globe/shaders.ts",import.meta.url),"utf8");
  assert.match(shader,/return forecastDensity\(p,h,fineDetail\)/);
  assert.match(shader,/#elif defined\(BAV_GLOBAL_FORECAST\)/);
  assert.match(shader,/tau\+=densityAt\(p\+uSun/);
  assert.match(shader,/if\(transmittance<0.015\)break/);
});
test("unchanged model refreshes avoid repeat transport compression, download and browser decompression",async()=>{
  const api=await readFile(new URL("../app/api/radar/clouds/route.ts",import.meta.url),"utf8");
  const gate=api.indexOf('request.headers.get("if-none-match")===etag');
  assert.ok(gate>0&&gate<api.indexOf("cachedTransport.get(mode)?.raw"));
  assert.match(api,/status:304,headers/);
  const ui=await readFile(new URL("../components/PublicBaRadar.tsx",import.meta.url),"utf8");
  const section=ui.slice(ui.indexOf('let cloudETag=""'),ui.indexOf('[cloudSettings.realWorld, cloudSettings.coverageMode'));
  assert.match(section,/"If-None-Match":cloudETag/);
  assert.ok(section.indexOf("response.status===304")<section.indexOf("unpackCloudData("));
  assert.match(section,/cloudETag="";setCloudData\(null\)/,"an error must not strand an empty view behind a retained ETag");
});
