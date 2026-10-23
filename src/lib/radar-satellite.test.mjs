import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { abiScanAngles,abiPixel,satelliteMaskState,encodeSatelliteColumn,satelliteIsCloud,satelliteOpticalDepth,satelliteGridIndex,estimateSatelliteMotion,SATELLITE_MAX_AGE_MS } from "./radar-satellite-math.ts";
import { validateSatelliteCloudData,unknownSatelliteCloudData } from "./radar-satellite-validation.ts";
import { unpackCloudData } from "./radar-cloud-transport.ts";
import { decodeSatelliteFeed,fetchSatelliteFeed,SATELLITE_FEED_MAX_BYTES } from "./radar-satellite-feed.ts";

const projection={longitude:-75,height:35786023,semiMajor:6378137,semiMinor:6356752.31414,sweep:"x"};
// Independent NOAA PUG scan-to-lat/lon equations test the inverse path used
// by the ingester, instead of validating one projection with itself.
function inverse(x,y,p=projection){
  const H=p.height+p.semiMajor,r=(p.semiMajor/p.semiMinor)**2;
  const a=Math.sin(x)**2+Math.cos(x)**2*(Math.cos(y)**2+r*Math.sin(y)**2),b=-2*H*Math.cos(x)*Math.cos(y),c=H*H-p.semiMajor**2;
  const rs=(-b-Math.sqrt(b*b-4*a*c))/(2*a),sx=rs*Math.cos(x)*Math.cos(y),sy=-rs*Math.sin(x),sz=rs*Math.cos(x)*Math.sin(y);
  return {latitude:Math.atan(r*sz/Math.hypot(H-sx,sy))*180/Math.PI,longitude:p.longitude-Math.atan2(sy,H-sx)*180/Math.PI};
}
test("ABI navigation uses actual ellipsoid/slot and roundtrips NOAA scan coordinates",()=>{
  for(const p of [projection,{...projection,longitude:-137}])for(const [x,y]of [[0,0],[-.024052,.095340],[.08,-.04],[-.1,.02]]){
    const point=inverse(x,y,p),scan=abiScanAngles(point.latitude,point.longitude,p);
    assert.ok(scan);assert.ok(Math.abs(scan.x-x)<1e-10);assert.ok(Math.abs(scan.y-y)<1e-10);assert.ok(scan.zenith>=0&&scan.zenith<90);
  }
  assert.equal(abiScanAngles(0,105,projection),null);
  assert.equal(abiScanAngles(91,0,projection),null);
  assert.equal(abiScanAngles(0,-75,{...projection,sweep:"y"}),null);
});
test("each ABI product's own increasing/decreasing grid is sampled without pole/seam stretching",()=>{
  assert.equal(abiPixel(.151844,.151844,-.000056,5424),0);
  assert.equal(abiPixel(.151564,.151844,-.000056,5424),5);
  assert.equal(abiPixel(-.151844,-.151844,.000056,5424),0);
  assert.equal(abiPixel(1,.151844,-.000056,5424),-1);
  assert.equal(abiPixel(0,0,0,5424),-1);
  assert.equal(satelliteGridIndex(0,180,1800,900),satelliteGridIndex(0,-180,1800,900));
  assert.equal(Math.floor(satelliteGridIndex(-90,0,1800,900)/1800),899);
  assert.equal(satelliteGridIndex(NaN,0,1800,900),-1);
});
test("clear is exactly empty; probable clear, missing, fill and bad quality never become generated clouds",()=>{
  assert.deepEqual([0,1,2,3].map(v=>satelliteMaskState(v,0)),[1,2,3,4]);
  for(const dqf of [1,2,6,255,NaN])assert.equal(satelliteMaskState(3,dqf),0);
  assert.equal(satelliteMaskState(255,0),0);
  for(const state of [0,1,2])for(const tau of [null,0,160])for(const height of [null,200,18000])assert.deepEqual(encodeSatelliteColumn(state,tau,height),[0,0,0,state]);
});
test("optical depth/top retrievals drive columns; missing retrievals never get invented values",()=>{
  for(const top of [200,1000,6000,18000])for(const tau of [0,.5,8,80,160]){
    const c=encodeSatelliteColumn(4,tau,top);assert.ok(satelliteIsCloud(c[3]));assert.equal(c[3]&8,0);assert.equal(c[3]&16,0);assert.ok(c[3]&32);assert.ok(c[1]<c[2]&&c[2]<=180);
    assert.ok(Math.abs(satelliteOpticalDepth(c[0])-tau)<=Math.max(.03,tau*.022));
  }
  const missing=encodeSatelliteColumn(3,null,null);assert.ok(missing[3]&8);assert.ok(missing[3]&16);assert.ok(missing[3]&32);assert.deepEqual(missing.slice(0,3),[0,0,0]);
});
const iso="2026-10-23T20:00:00.000Z",now=Date.parse(iso)+600000;
function field(){
  const width=8,height=4,values=new Uint8Array(width*height*4);values.set(encodeSatelliteColumn(4,8,4000),0);
  const source={satellite:"GOES-19",scanStartAt:"2026-10-23T19:50:21.000Z",scanEndAt:iso,mask:"https://noaa-goes19.s3.amazonaws.com/ABI-L2-ACMF/2026/296/19/OR_scan.nc",opticalDepth:"https://noaa-goes19.s3.amazonaws.com/ABI-L2-CODF/2026/296/19/OR_scan.nc",topHeight:"https://noaa-goes19.s3.amazonaws.com/ABI-L2-ACHAF/2026/296/19/OR_scan.nc"};
  return {source:"NOAA GOES ABI",width,height,stepDeg:45,west:-180,north:90,displayResolutionDeg:45,sourceResolutionDeg:45,validAt:iso,cycleAt:iso,fetchedAt:iso,stale:false,encoding:"rgba8-base64",fields:["ACMF","CODF","ACHAF"],layers:[],satellite:{version:2,mode:"satellite-observed",status:"ready",current:{observedAt:iso,sources:[source],volume:Buffer.from(values).toString("base64")},previous:null,motion:Buffer.alloc(width*height*4).toString("base64"),intervalSeconds:0,winds:null,counts:{cloudy:1,reconstructed:1,clear:0,uncertain:0,unknown:31,opticalDepthMissing:0,topMissing:0,developing:0}}};
}
test("observed artifact validation rejects malformed/stale/forecast fields and clear geometry",()=>{
  assert.equal(validateSatelliteCloudData(field(),now).source,"NOAA GOES ABI");
  const corruptions=[d=>d.source="NOAA GFS",d=>d.width=9,d=>d.satellite.current.observedAt="not a time",d=>d.satellite.current.volume="AAAA",d=>d.satellite.current.sources[0].mask="https://example.com/not-noaa.nc",d=>d.satellite.intervalSeconds=600,d=>{const b=Buffer.from(d.satellite.current.volume,"base64");b[3]=1;d.satellite.current.volume=b.toString("base64");}];
  for(const mutate of corruptions){const d=field();mutate(d);assert.throws(()=>validateSatelliteCloudData(d,now));}
  assert.throws(()=>validateSatelliteCloudData(field(),Date.parse(iso)+SATELLITE_MAX_AGE_MS+1));
  const unknown=unknownSatelliteCloudData("No satellite coverage",now);assert.equal(unknown.satellite.status,"unknown");assert.deepEqual([...Buffer.from(unknown.satellite.current.volume,"base64")],[0,0,0,0]);assert.equal(unknown.satellite.current.observedAt,"");
});
test("compressed transport roundtrips current/history/motion, and rejects oversized fields",async()=>{
  const d=field();d.satellite.previous=structuredClone(d.satellite.current);d.satellite.previous.observedAt="2026-10-23T19:50:00.000Z";d.satellite.intervalSeconds=600;
  const encoded=structuredClone(d),zip=x=>gzipSync(Buffer.from(x,"base64")).toString("base64");encoded.encoding="rgba8-gzip-base64";encoded.satellite.current.volume=zip(d.satellite.current.volume);encoded.satellite.previous.volume=zip(d.satellite.previous.volume);encoded.satellite.motion=zip(d.satellite.motion);
  assert.deepEqual(await unpackCloudData(encoded),d);
  encoded.satellite.motion=zip(Buffer.alloc(10000).toString("base64"));await assert.rejects(()=>unpackCloudData(encoded));
});
test("hosted observation feed is bounded, validated and never substitutes stale or forecast data",async()=>{
  const data=field(),packed=gzipSync(Buffer.from(JSON.stringify(data)));
  assert.deepEqual(decodeSatelliteFeed(packed,now),data);
  assert.throws(()=>decodeSatelliteFeed(packed,Date.parse(iso)+SATELLITE_MAX_AGE_MS+1));
  assert.throws(()=>decodeSatelliteFeed(Buffer.alloc(SATELLITE_FEED_MAX_BYTES+1),now));
  assert.throws(()=>decodeSatelliteFeed(gzipSync(Buffer.from('{"source":"NOAA GFS"}')),now));
  assert.deepEqual(await fetchSatelliteFeed(async()=>new Response(packed),now),data);
  await assert.rejects(()=>fetchSatelliteFeed(async()=>new Response(null,{status:503}),now));
  await assert.rejects(()=>fetchSatelliteFeed(async()=>new Response(packed,{headers:{'content-length':String(SATELLITE_FEED_MAX_BYTES+1)}}),now));
});
test("wind-assisted consecutive-frame tracking follows translated cloud features, not random noise",()=>{
  const width=720,height=360,previous=new Uint8Array(width*height*4),current=new Uint8Array(previous.length);
  for(let i=3;i<previous.length;i+=4)previous[i]=current[i]=1;
  for(let y=170;y<190;y++)for(let x=350;x<370;x++){const seed=(Math.imul(x+23,73856093)^Math.imul(y+17,19349663))>>>0;if(seed%5!==0){const c=encodeSatelliteColumn(4,2+seed%30,4000);previous.set(c,(y*width+x)*4);current.set(c,(y*width+x+1)*4);}}
  const result=estimateSatelliteMotion(current,previous,width,height,600,()=>({east:92,north:0}));
  let i=(180*width+361)*4;while(!satelliteIsCloud(current[i+3]))i+=4;assert.ok(result[i]>165&&result[i]<185,`east encoding ${result[i]}`);assert.ok(result[i+2]>30);assert.notEqual(result[i+3],255,"translated cloud is not labelled new development");
  for(let n=3;n<result.length;n+=4)if(!satelliteIsCloud(current[n]))assert.equal(result[n],0);
});
test("unexplained new cover is developing only over confidently clear previous observations",()=>{
  const w=72,h=36,current=new Uint8Array(w*h*4),previous=new Uint8Array(current.length),i=(18*w+36)*4;
  for(let n=3;n<current.length;n+=4)current[n]=previous[n]=1;
  current.set(encodeSatelliteColumn(4,8,4000),i);
  let result=estimateSatelliteMotion(current,previous,w,h,600,()=>({east:0,north:0}));assert.equal(result[i+3],255);
  result=estimateSatelliteMotion(current,previous,w,h,600);assert.equal(result[i+3],0,"without trustworthy transport, a new patch stays unclassified rather than claimed as growth");
  previous.fill(0);result=estimateSatelliteMotion(current,previous,w,h,600);assert.equal(result[i+3],0,"missing data is not evidence of developing cover");
  result=estimateSatelliteMotion(current,null,w,h,600);assert.equal(result[i+3],0);
});
test("Live rendering is observation-gated before noise/motion; GFS coverage path is removed",async()=>{
  const shader=await readFile(new URL("../components/radar-globe/shaders.ts",import.meta.url),"utf8");
  const section=shader.slice(shader.indexOf("float satelliteDensity"),shader.indexOf("float densityAtDetail"));
  assert.ok(section.indexOf("if(state<2.5||state>4.5)return 0.0;")<section.indexOf("vec4 motion="));
  assert.ok(section.indexOf("if(state<2.5||state>4.5)return 0.0;")<section.indexOf("float shape=layerCloud"));
  assert.ok(section.indexOf("if(mod(floor(flags/8.0),4.0)>0.5)return 0.0;")<section.indexOf("float shape=layerCloud"));
  assert.match(shader,/if\(uSatelliteMode>0.5\)return satelliteDensity/);
  const server=await readFile(new URL("./radar-clouds.ts",import.meta.url),"utf8");assert.doesNotMatch(server,/GribMessage|LCDC|MCDC|HCDC|refreshClouds/);assert.match(server,/unknownSatelliteCloudData/);
});
