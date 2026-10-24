import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { ACCEPTED_CLOUD_REVISION,acceptedCloudAppearanceGLSL } from "../components/radar-globe/cloud-appearance.ts";
import { abiScanAngles,abiPixel,satelliteMaskState,encodeSatelliteColumn,satelliteIsCloud,satelliteOpticalDepth,satelliteGridIndex,estimateSatelliteMotion,SATELLITE_MAX_AGE_MS } from "./radar-satellite-math.ts";
import { validateSatelliteCloudData,unknownSatelliteCloudData } from "./radar-satellite-validation.ts";
import { unpackCloudData } from "./radar-cloud-transport.ts";
import { decodeSatelliteFeed,fetchSatelliteFeed,SATELLITE_FEED_MAX_BYTES } from "./radar-satellite-feed.ts";
import {buildSatelliteRenderTexture,satelliteVolumeAvailable,estimatedSatelliteThickness,satelliteEdgeDistance,satelliteSupportDistances,SATELLITE_SUPPORT_RANGE,satelliteBoundaryEnvelope,observedCloudDistance} from "./radar-satellite-render.ts";
import {buildCloudFootprint,sampleCloudFootprint,CLOUD_BOUNDARY_BAND_KM} from "./radar-cloud-footprint.ts";

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
test("render filtering never changes cloud support and rounds only inward at unsupported boundaries",()=>{
  const w=8,h=4,source=new Uint8Array(w*h*4);
  source.set(encodeSatelliteColumn(4,8,4000),(1*w+3)*4);
  source.set(encodeSatelliteColumn(4,30,12000),(1*w+4)*4);
  source.set(encodeSatelliteColumn(4,null,12000),(2*w+3)*4);
  const unchanged=source.slice(),render=buildSatelliteRenderTexture(source,w,h);
  assert.deepEqual(source,unchanged,"render padding cannot edit the authoritative mask or retrievals");
  for(const channel of [0,2])assert.equal(render[(w+3)*4+channel],source[(w+3)*4+channel],"retrieved optical depth/top stay unchanged");
  assert.equal(render[(w+3)*4+1],Math.round(255/SATELLITE_SUPPORT_RANGE),"unused renderer base channel holds the continuous distance");
  assert.equal(render[(w+3)*4+3]&2,0,"adjacent supported cells have no seam between them");
  assert.ok(render[(w+3)*4+3]&1,"unsupported west neighbour grants an inward taper");
  assert.ok(render[(w+3)*4+3]&8,"a missing-property cloud is still unsupported volume");
  assert.equal(satelliteVolumeAvailable(source[(2*w+3)*4+3]),false);
  assert.equal(satelliteVolumeAvailable(source[(w+2)*4+3]),false,"RGB padding cannot turn missing/clear into support");
  assert.equal(satelliteEdgeDistance(1,0,.5,20,20),0);
  assert.equal(satelliteEdgeDistance(2,1,.5,20,20),0);
  assert.equal(satelliteEdgeDistance(4,.5,0,20,20),0);
  assert.equal(satelliteEdgeDistance(8,.5,1,20,20),0);
  assert.equal(satelliteEdgeDistance(16,0,0,20,20),0);
  assert.ok(satelliteEdgeDistance(16,.2,.2,20,20)>5,"corners are rounded with geometric distance, not square clipping");
  const seam=new Uint8Array(w*h*4);seam.set(encodeSatelliteColumn(4,8,4000),(w+0)*4);seam.set(encodeSatelliteColumn(4,8,4000),(w+w-1)*4);
  assert.equal(buildSatelliteRenderTexture(seam,w,h)[w*4+3]&1,0,"longitude seam joins adjacent supported cells");
  assert.throws(()=>buildSatelliteRenderTexture(source,9,h));
});

test("history properties skip unused boundary reconstruction without changing retrieved values",()=>{
  const w=8,h=4,source=new Uint8Array(w*h*4);
  for(const [x,y] of [[2,1],[3,1],[4,2]])source.set(encodeSatelliteColumn(4,8+x,4000+x*200),(y*w+x)*4);
  const current=buildSatelliteRenderTexture(source,w,h),history=buildSatelliteRenderTexture(source,w,h,false);
  for(let i=0;i<source.length;i+=4){
    assert.equal(history[i],current[i]);assert.equal(history[i+2],current[i+2]);
    assert.equal(history[i+1],history[i]>0?255:0);assert.equal(history[i+3],0);
  }
});

test("appearance confidence is a separate continuous property, not a raw classification switch",()=>{
  const source=new Uint8Array([...encodeSatelliteColumn(3,8,4000),...encodeSatelliteColumn(4,8,4000)]),before=source.slice();
  const properties=buildSatelliteRenderTexture(source,2,1,false,10);
  assert.equal(properties[1],166);assert.equal(properties[5],255);assert.deepEqual(source,before);
  assert.equal(properties[3],255);assert.equal(properties[7],255);
});

test("curved formation masses are deterministic, bounded and never occupy unsupported observations",()=>{
  const w=16,h=12,source=new Uint8Array(w*h*4);
  for(let y=2;y<10;y++)for(let x=2;x<14;x++)source.set(encodeSatelliteColumn(4,12,5000),(y*w+x)*4);
  for(const [x,state,tau] of [[5,1,12],[6,2,12],[7,0,12],[8,4,null]])source.set(encodeSatelliteColumn(state,tau,5000),(6*w+x)*4);
  const unchanged=source.slice(),field=buildCloudFootprint(source,w,h,4);
  assert.deepEqual(source,unchanged);assert.deepEqual(buildCloudFootprint(source,w,h,4),field);
  assert.equal(field.pixels.length,w*h*16);assert.ok(field.lobes>0&&field.lobes<=w*h*2);
  let positive=0;
  for(let y=0;y<field.height;y++)for(let x=0;x<field.width;x++)if(field.pixels[y*field.width+x]>128){
    positive++;
    assert.ok(satelliteVolumeAvailable(source[(Math.floor(y/4)*w+Math.floor(x/4))*4+3]),"even pre-gate lobe samples remain inside usable cloud observations");
  }
  assert.ok(positive>100,"do not fix squares by deleting the entire cloud bank");
  assert.equal(buildCloudFootprint(new Uint8Array(source.length),w,h,4).lobes,0);
  assert.throws(()=>buildCloudFootprint(source,w,h,3));
});

test("large straight mask edges reconstruct as varying curved silhouettes, not an inset rectangle",()=>{
  const w=32,h=24,source=new Uint8Array(w*h*4);
  for(let y=2;y<22;y++)for(let x=8;x<24;x++)source.set(encodeSatelliteColumn(4,12,5000),(y*w+x)*4);
  const field=buildCloudFootprint(source,w,h,4),edge=[];
  for(let y=5*4;y<19*4;y++){
    let x=0;while(x<field.width&&field.pixels[y*field.width+x]<=128)x++;
    edge.push(x/4);
  }
  assert.ok(Math.max(...edge)-Math.min(...edge)>.5,"outline variation must be substantial at formation scale");
  let run=0,longest=0,last=-1;
  for(const value of edge){run=value===last?run+1:1;last=value;longest=Math.max(longest,run);}
  assert.ok(longest<12,`no long grid-aligned plateau: ${longest/4} cells`);
});

test("authorised estimated fringes are independently capped at 10 km after filtering; empty observations stay empty",()=>{
  const w=1800,h=900,source=new Uint8Array(w*h*4),west=880,east=920,north=430,south=470;
  for(let y=north;y<south;y++)for(let x=west;x<east;x++)source.set(encodeSatelliteColumn(4,12,5000),(y*w+x)*4);
  const unchanged=source.slice(),field=buildCloudFootprint(source,w,h,4,CLOUD_BOUNDARY_BAND_KM);
  assert.deepEqual(source,unchanged);
  let estimates=0;
  for(let y=north-1;y<south+1;y+=.125)for(let x=west-1;x<east+1;x+=.125){
    if(sampleCloudFootprint(field,x/w,y/h)<=128||observedCloudDistance(source,w,h,x/w,y/h)>=CLOUD_BOUNDARY_BAND_KM)continue;
    const dx=Math.max(west-x,0,x-east)*40030.228/w*Math.cos((.5-y/h)*Math.PI);
    const dy=Math.max(north-y,0,y-south)*20015.114/h;
    const distance=Math.hypot(dx,dy);
    assert.ok(distance<=10,`estimated fringe exceeds 10 km: ${distance}`);
    if(distance>0)estimates++;
  }
  assert.ok(estimates>0,"test the actual authorised extension, not an entirely inward-only field");
  assert.equal(sampleCloudFootprint(field,.1,.1),0,"far unknown regions remain empty");
  const empty=buildCloudFootprint(new Uint8Array(8*4*4),8,4,4,10);
  assert.equal(empty.lobes,0);assert.ok(empty.pixels.every(v=>v===0));
});

test("cubic formation lookup has no value or slope jumps at texture-cell boundaries, including Low",()=>{
  const w=32,h=24,source=new Uint8Array(w*h*4);
  for(let y=3;y<21;y++)for(let x=4;x<28;x++)source.set(encodeSatelliteColumn(4,12,5000),(y*w+x)*4);
  for(const scale of [1,2,4]){
    const field=buildCloudFootprint(source,w,h,scale,10),epsilon=1e-4;
    for(let y=4;y<20;y+=.23)for(let x=4;x<28;x+=1/scale){
      const boundary=x+.5/scale;
      const left=sampleCloudFootprint(field,(boundary-epsilon)/w,y/h),at=sampleCloudFootprint(field,boundary/w,y/h),right=sampleCloudFootprint(field,(boundary+epsilon)/w,y/h);
      assert.ok(Math.abs(right-left)<.1,"a nearest-mass switch must not make an abrupt edge");
      assert.ok(Math.abs((right-at)-(at-left))/epsilon<.5,"the first derivative must also stay continuous");
    }
    for(let v=.2;v<.8;v+=.1)assert.ok(Math.abs(sampleCloudFootprint(field,0,v)-sampleCloudFootprint(field,1,v))<1e-9,"longitude wraps without a seam");
  }
});

test("the metric cap uses observed rectangles across the dateline, excluding missing retrievals",()=>{
  const w=1800,h=900,source=new Uint8Array(w*h*4),y=450;
  source.set(encodeSatelliteColumn(4,12,5000),(y*w)*4);
  for(const dx of [.05,.25,.45,.55]){
    const u=1-dx/w,v=(y+.5)/h;
    const actual=observedCloudDistance(source,w,h,u,v),expected=dx*40030.228/w*Math.cos((.5-v)*Math.PI);
    assert.ok(Math.abs(actual-expected)<1e-8);
    assert.equal(actual<10,expected<10);
  }
  source.set(encodeSatelliteColumn(4,null,5000),(y*w)*4);
  assert.equal(observedCloudDistance(source,w,h,0,(y+.5)/h),Infinity,"an incomplete retrieval cannot authorise a fringe");
});
const canonicalDigest=source=>createHash("sha256").update(source.replace(/\/\/[^\n]*/g,"").replace(/\s+/g,"")).digest("hex");

test("linear-time multi-cell distances match independent brute force including wrapped longitude and poles",()=>{
  for(const [w,h] of [[1,1],[3,5],[8,9],[15,13]])for(const variant of [0,1,2,3]){
    const source=new Uint8Array(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const cloudy=variant===0||variant!==1&&((x*31+y*17+variant*11)%7!==0);
      source.set(encodeSatelliteColumn(cloudy?4:1,8,4000),(y*w+x)*4);
    }
    const unchanged=source.slice(),distance=satelliteSupportDistances(source,w,h);
    assert.deepEqual(source,unchanged);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let expected=Math.min(SATELLITE_SUPPORT_RANGE,y+1,h-y);
      for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(!satelliteVolumeAvailable(source[(yy*w+xx)*4+3])){
        const dx=Math.min(Math.abs(x-xx),w-Math.abs(x-xx));expected=Math.min(expected,Math.hypot(dx,y-yy));
      }
      assert.ok(Math.abs(distance[y*w+x]-expected)<1e-6,`${w}x${h}: ${x},${y}: ${distance[y*w+x]} vs ${expected}`);
    }
  }
});

test("distance texture spans multiple cells without repeating a boundary in every cell",()=>{
  const w=32,h=20,source=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)source.set(encodeSatelliteColumn(x>=8&&x<24?4:1,8,4000),(y*w+x)*4);
  const render=buildSatelliteRenderTexture(source,w,h);
  const row=Array.from({length:8},(_,x)=>render[(10*w+8+x)*4+1]*SATELLITE_SUPPORT_RANGE/255);
  assert.ok(row[0]<row[1]&&row[1]<row[2]&&row[2]<row[3]&&row[3]<row[4]);
  assert.equal(row[7],SATELLITE_SUPPORT_RANGE);
  assert.equal(render[(10*w+7)*4+1],0,"clear cells have zero distance, not padded support");
});

test("boundary envelope shapes volume coverage, rounds upper shoulders and preserves the interior",()=>{
  assert.equal(satelliteBoundaryEnvelope(0,22,22,4,.5),0);
  assert.equal(satelliteBoundaryEnvelope(-1,22,22,4,.5),0);
  assert.equal(satelliteBoundaryEnvelope(100,22,22,4,.9),1);
  const low=satelliteBoundaryEnvelope(5,22,22,4,.1),high=satelliteBoundaryEnvelope(5,22,22,4,.9);
  assert.ok(high<low&&low<1,"upper edge retreats rather than extruding a vertical wall");
  assert.ok(satelliteBoundaryEnvelope(7,22,22,4,.1)>satelliteBoundaryEnvelope(5,22,22,4,.1));
  assert.ok(satelliteEdgeDistance(5,.9,.9,20,20,9.6)>16,"corner distance must not plateau at its radius inside the bank");
});

test("convex mask corners become inward quarter-circles rather than square tips",()=>{
  for(const [edges,x,y] of [[5,.05,.05],[6,.95,.05],[9,.05,.95],[10,.95,.95]]){
    assert.ok(satelliteEdgeDistance(edges,x,y,20,20)>0,"old square support includes the tip");
    assert.ok(satelliteEdgeDistance(edges,x,y,20,20,9.6)<0,"rounded support removes that tip");
    assert.ok(satelliteEdgeDistance(edges,.5,.5,20,20,9.6)>4,"interior stays opaque after feathering");
  }
  assert.equal(satelliteEdgeDistance(5,0,.5,20,20,9.6),0,"round joins the straight side continuously");
  assert.equal(satelliteEdgeDistance(5,.5,0,20,20,9.6),0);
});

test("isolated cloudy cells are rounded symmetrically, with bounded radii",()=>{
  const corners=[[.1,.1],[.9,.1],[.1,.9],[.9,.9]];
  const distances=corners.map(([x,y])=>satelliteEdgeDistance(255,x,y,20,20,9.6));
  assert.ok(distances.every(d=>d<0));
  assert.ok(distances.every(d=>Math.abs(d-distances[0])<1e-10));
  assert.equal(satelliteEdgeDistance(255,.5,.5,20,20,10),10);
  assert.equal(satelliteEdgeDistance(255,.1,.1,20,20,100),satelliteEdgeDistance(255,.1,.1,20,20,10));
  assert.equal(satelliteEdgeDistance(0,.1,.1,20,20,10),1e6,"no boundary means no new cut");
});

test("rounding can only subtract support and does not cut supported shared edges",()=>{
  for(let edges=0;edges<256;edges++)for(let x=0;x<=10;x++)for(let y=0;y<=10;y++){
    assert.ok(satelliteEdgeDistance(edges,x/10,y/10,22,18,8.64)<=satelliteEdgeDistance(edges,x/10,y/10,22,18)+1e-10);
  }
  const w=8,h=4,source=new Uint8Array(w*h*4);
  for(const x of [0,w-1])source.set(encodeSatelliteColumn(4,8,4000),(w+x)*4);
  const render=buildSatelliteRenderTexture(source,w,h),west=render[(w+w-1)*4+3],east=render[w*4+3];
  for(let y=0;y<=20;y++){
    const a=satelliteEdgeDistance(west,1,y/20,20,20,9.6),b=satelliteEdgeDistance(east,0,y/20,20,20,9.6);
    assert.ok(Math.abs(a-b)<1e-10,"supported dateline neighbours join continuously");
    if(y>=5&&y<=15)assert.ok(a>=4,"no opaque-interior seam");
  }
});

test("accepted cloud appearance and raymarch remain identical to pre-satellite build 5495a8d",async()=>{
  assert.equal(ACCEPTED_CLOUD_REVISION,"5495a8d");
  assert.equal(canonicalDigest(acceptedCloudAppearanceGLSL),"06a81cc780f6aa669ca04d39d418b3a1c5590c91f750c44e051825f674a97ca2");
  assert.doesNotMatch(acceptedCloudAppearanceGLSL,/uSatellite|opticalDepth|observedBody|sizedCloudNoise|densityProbeDistance/);
  const shader=await readFile(new URL("../components/radar-globe/shaders.ts",import.meta.url),"utf8");
  const fragment=shader.slice(shader.indexOf("float phaseHG("),shader.indexOf("  if(uDebug>0.5){",shader.indexOf("export const cloudFragment")));
  assert.equal(canonicalDigest(fragment),"4861183e84e153391557c2d1ad4d699975e244cf9a6baa9840c619c768df44c2");
  assert.match(shader,/\$\{acceptedCloudAppearanceGLSL\}/);
  assert.doesNotMatch(shader,/float layerCloud\(|budgetGrowth|previousColumn|densityColumnDepth/);
});

test("the adapter supplies measured inputs without rescaling the accepted cloud model",async()=>{
  const adapter=await readFile(new URL("../components/radar-globe/satellite-cloud-adapter.ts",import.meta.url),"utf8");
  assert.match(adapter,/vec4 column=vec4\(0\.58,base\/25\.5,top\/25\.5,1\.0\)/,"interior bank occupancy must remain unchanged");
  assert.match(adapter,/shape=max\(0\.0,shape-\(1\.0-support\)\*1\.6\)/,"boundary must erode the existing 3D body, not only alpha");
  assert.match(adapter,/distanceKm=cloudFormationDistance\(uv\)/,"smooth formation masses must drive the actual renderer");
  assert.match(adapter,/cloudCubicWeights/);assert.match(adapter,/textureLod\(uSatelliteFootprint/);
  assert.match(adapter,/confidence=clamp\(properties.g,0.65,1.0\)/);
  assert.doesNotMatch(adapter,/\*\(state<3.5\?0.65:1.0\)/,"categorical brightness switches must not expose the original grid");
  assert.doesNotMatch(adapter,/cloudMassId|cloudMassDistance/,"do not restore the discontinuous nearest-mass selector");
  assert.match(adapter,/fromObservation=cloudObservationDistance\(uv\)/);
  assert.match(adapter,/if\(fromObservation>\$\{CLOUD_BOUNDARY_BAND_KM.toFixed\(1\)\}\)return 0\.0;/,"cubic filtering must not escape the independent observed-distance cap");
  assert.doesNotMatch(adapter,/satelliteSupportDistance\(|satelliteEdgeDistance\(/,"do not reapply the old cell-shaped silhouette");
  assert.match(adapter,/layerCloud\(column,p,h,kind,fineDetail\)/);
  assert.match(adapter,/top>7\.0&&opticalDepth<2\.0\?2\.0:0\.0/);
  assert.doesNotMatch(adapter,/sizedCloudNoise|observedBody|uObservationSeconds|advected|float scale=/);
  assert.match(adapter,/beforeUV/,"winds still associate consecutive observations");
  for(const top of [200,1000,3000,8000,18000])for(const tau of [0,2,8,30,160]){
    const depth=estimatedSatelliteThickness(top,tau);assert.ok(depth>=0&&depth<=top-100);
  }
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
test("Live rendering gates on prepared bounded formations and valid source-derived retrievals before noise/motion",async()=>{
  const shader=await readFile(new URL("../components/radar-globe/shaders.ts",import.meta.url),"utf8");
  const section=await readFile(new URL("../components/radar-globe/satellite-cloud-adapter.ts",import.meta.url),"utf8");
  const properties=section.indexOf("vec3 properties=");assert.ok(properties>=0);
  for(const gate of ["if(uSatelliteFootprintReady<0.5)return 0.0;","if(currentColumn.a<0.5)return 0.0;","if(distanceKm<=0.0)return 0.0;"]){
    const at=section.indexOf(gate);assert.ok(at>=0&&at<properties&&at<section.indexOf("vec4 motion="),gate);
  }
  assert.match(section,/if\(uSatelliteFootprintReady<0\.5\)return 0\.0;/,"never render an old/unprepared formation field");
  assert.match(section,/support\*shape\*opticalDepth/);
  assert.match(shader,/if\(uSatelliteMode>0.5\)return satelliteDensity/);
  const server=await readFile(new URL("./radar-clouds.ts",import.meta.url),"utf8");assert.doesNotMatch(server,/GribMessage|LCDC|MCDC|HCDC|refreshClouds/);assert.match(server,/unknownSatelliteCloudData/);
  const scene=await readFile(new URL("../components/radar-globe/scene.ts",import.meta.url),"utf8");
  assert.match(scene,/field\.id !== weatherRevision/);assert.match(scene,/footprintWorker\?\.terminate\(\)/);
  assert.match(scene,/estimated boundary fringe \(≤10 km\); not directly observed/);
  const caption=await readFile(new URL("../components/BaRadarThreeGlobe.tsx",import.meta.url),"utf8");
  assert.match(caption,/Reconstructed cloud edges · uncertainty band ≤10 km/);
});

test("one shared observation adapter governs volume and ground shadows; calibration stays explicit",async()=>{
  const shader=await readFile(new URL("../components/radar-globe/shaders.ts",import.meta.url),"utf8");
  assert.match(shader,/\$\{satelliteCloudAdapterGLSL\}/);
  assert.match(shader,/if\(uSatelliteMode>0.5\)return satelliteDensity/);
  assert.match(shader,/tau\+=densityAt\(p\+uSun/);
  assert.match(shader,/#ifdef BAV_FORECAST_CALIBRATION/);
  assert.match(shader,/#else\s+if\(uSatelliteMode>0.5\)return satelliteDensity\(p,h,fineDetail\);\s+return 0\.0;/);
  assert.match(shader,/#ifdef BAV_GLOBAL_FORECAST\s+\$\{forecastCloudAppearanceGLSL\}/);
  const scene=await readFile(new URL("../components/radar-globe/scene.ts",import.meta.url),"utf8");
  assert.match(scene,/process\.env\.NODE_ENV !== "production" \? read\(\)\.testCloudProfile : undefined/);
  assert.match(scene,/cloudRenderer: forecastPixels.size\?FORECAST_CLOUD_REVISION:ACCEPTED_CLOUD_REVISION/);
});
