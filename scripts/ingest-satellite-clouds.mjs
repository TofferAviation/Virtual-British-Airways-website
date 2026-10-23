/** Run outside the web request/GPU process: npm run clouds:ingest.
 * NOAA files are large. Decode once, publish one bounded observed grid, and
 * serve it to every viewer. No imagery interpretation or synthetic coverage. */
import { mkdir, rename, stat, writeFile, readdir, unlink } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { resolve, basename } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import * as h5 from "h5wasm/node";
import { abiScanAngles, abiPixel, satelliteMaskState, encodeSatelliteColumn, estimateSatelliteMotion, SATELLITE_MAX_AGE_MS } from "../src/lib/radar-satellite-math.ts";
import { validateSatelliteCloudData } from "../src/lib/radar-satellite-validation.ts";

const cache=resolve(".bav-data/satellite-clouds/raw");
const products=["ABI-L2-ACMF","ABI-L2-CODF","ABI-L2-ACHAF"];
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(90_000)});if(!r.ok)throw Error(`NOAA ${r.status}: ${url}`);return r;}
export async function productKeys(satellite,product,now=new Date()) {
  const keys=[];
  for(let back=0;back<3;back++) {
    const d=new Date(+now-back*3600_000),day=String(Math.floor((d-Date.UTC(d.getUTCFullYear(),0,0))/864e5)).padStart(3,"0");
    const prefix=`${product}/${d.getUTCFullYear()}/${day}/${String(d.getUTCHours()).padStart(2,"0")}/`;
    const xml=await(await get(`https://noaa-goes${satellite}.s3.amazonaws.com/?list-type=2&prefix=${prefix}`)).text();
    for(const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g))if(match[1].startsWith(prefix)&&!match[1].includes("..")&&/\.nc$/.test(match[1]))keys.push(match[1]);
  }
  return [...new Set(keys)].sort();
}
async function download(satellite,key) {
  await mkdir(cache,{recursive:true});
  const file=resolve(cache,basename(key));
  try{if((await stat(file)).size>1024)return file;}catch{}
  const r=await get(`https://noaa-goes${satellite}.s3.amazonaws.com/${key}`);
  const length=Number(r.headers.get("content-length"));if(!Number.isFinite(length)||length<1024||length>128*1024**2)throw Error("Unexpected satellite product size");
  await pipeline(Readable.fromWeb(r.body),createWriteStream(`${file}.part`));
  if((await stat(`${file}.part`)).size!==length)throw Error("Incomplete satellite download");
  await rename(`${file}.part`,file);return file;
}
function scalar(value){return ArrayBuffer.isView(value)||Array.isArray(value)?value[0]:value;}
function attrs(object){return Object.fromEntries(Object.entries(object.attrs).map(([k,v])=>[k,scalar(v.value)]));}
function scan(key){return key.match(/_s(\d{11})\d+_/)?.[1];}
function field(f,name){
  const d=f.get(name);if(!d?.shape||d.shape.length!==2)throw Error(`Missing ABI ${name}`);
  const a=attrs(d),x=f.get("x"),y=f.get("y"),xa=attrs(x),ya=attrs(y),xv=x.value,yv=y.value;
  return {values:d.value,rows:d.shape[0],cols:d.shape[1],scale:a.scale_factor??1,offset:a.add_offset??0,fill:a._FillValue,
    firstX:xv[0]*(xa.scale_factor??1)+(xa.add_offset??0),stepX:(xv[1]-xv[0])*(xa.scale_factor??1),firstY:yv[0]*(ya.scale_factor??1)+(ya.add_offset??0),stepY:(yv[1]-yv[0])*(ya.scale_factor??1),units:a.units};
}
function sample(field,angles){if(!angles)return null;const x=abiPixel(angles.x,field.firstX,field.stepX,field.cols),y=abiPixel(angles.y,field.firstY,field.stepY,field.rows);if(x<0||y<0)return null;const raw=field.values[y*field.cols+x];return raw===field.fill||!Number.isFinite(raw)?null:raw*field.scale+field.offset;}
async function projectScan(satellite,keys,width,height,volume,scores,previous=false) {
  const files=[];
  try {
    for(const key of keys)files.push(new h5.File(await download(satellite,key),"r"));
    const [mask,cod,heightFile]=files,m=attrs(mask),ca=attrs(cod),ha=attrs(heightFile),p=attrs(mask.get("goes_imager_projection"));
    if(new Date(m.time_coverage_end)>new Date(Date.now()+120_000)||Date.now()-Date.parse(m.time_coverage_end)>SATELLITE_MAX_AGE_MS+(previous?1800_000:0))throw Error("Satellite scan outside ingestion age window");
    for(const a of [ca,ha])if(Math.abs(Date.parse(a.time_coverage_start)-Date.parse(m.time_coverage_start))>60_000)throw Error("Satellite products are not from the same scan");
    if(p.sweep_angle_axis!=="x")throw Error("Unsupported ABI projection sweep");
    for(const file of [cod,heightFile]){const other=attrs(file.get("goes_imager_projection"));for(const key of ["sweep_angle_axis","longitude_of_projection_origin","perspective_point_height","semi_major_axis","semi_minor_axis"])if(other[key]!==p[key])throw Error("Different ABI product navigation metadata");}
    const projection={longitude:p.longitude_of_projection_origin,height:p.perspective_point_height,semiMajor:p.semi_major_axis,semiMinor:p.semi_minor_axis,sweep:"x"};
    const acm=field(mask,"ACM"),quality=field(mask,"DQF"),optical=field(cod,"COD"),codQuality=field(cod,"DQF"),top=field(heightFile,"HT"),topQuality=field(heightFile,"DQF");
    if(optical.units!=="1"||top.units!=="m")throw Error("Unexpected ABI retrieval units");
    for(let row=0;row<height;row++)for(let col=0;col<width;col++){
      const latitude=90-(row+.5)*180/height,longitude=-180+(col+.5)*360/width,angles=abiScanAngles(latitude,longitude,projection);
      // ACHA is quantitatively limited near the limb. Do not stretch poor
      // geometry to fill Europe/poles or infer clear sky outside coverage.
      if(!angles||angles.zenith>70)continue;
      const state=satelliteMaskState(sample(acm,angles),sample(quality,angles));if(!state)continue;
      const i=row*width+col,score=angles.zenith;
      if(scores[i]<=score)continue;
      const oq=sample(codQuality,angles),tq=sample(topQuality,angles);
      const tau=oq!==null&&(oq&4)===0?sample(optical,angles):null;
      const h=tq===0?sample(top,angles):null;
      volume.set(encodeSatelliteColumn(state,tau,h),i*4);scores[i]=score;
    }
    return {satellite:`GOES-${satellite}`,scanStartAt:m.time_coverage_start,scanEndAt:m.time_coverage_end,mask:`https://noaa-goes${satellite}.s3.amazonaws.com/${keys[0]}`,opticalDepth:`https://noaa-goes${satellite}.s3.amazonaws.com/${keys[1]}`,topHeight:`https://noaa-goes${satellite}.s3.amazonaws.com/${keys[2]}`};
  }finally{files.forEach(f=>f.close());}
}
async function winds() {
  const origin=process.env.BAV_CLOUD_WIND_ORIGIN;
  if(!origin)return [];
  const url=new URL(origin);if(url.username||url.password||url.pathname!=="/"||(!["localhost","127.0.0.1"].includes(url.hostname)&&url.protocol!=="https:"))throw Error("Use a trusted website origin for GFS wind assistance");
  const grids=[];
  for(const id of ["surface","fl180","fl300"])try{
    const data=await(await get(`${url.origin}/api/radar/wind-grid?windLayer=${id}`)).json();
    if(data.source!=="NOAA GFS"||data.encoding!=="int16-le-base64"||data.width*data.height>2e6||Date.now()-Date.parse(data.validAt)>12*3600_000)continue;
    const u=Buffer.from(data.u,"base64"),v=Buffer.from(data.v,"base64");if(u.length!==data.width*data.height*2||v.length!==u.length)continue;
    grids.push({...data,u,v});
  }catch(e){console.warn(`Wind ${id} unavailable: ${e.message}`);}
  return grids;
}
function windPrior(grids) {return (lat,lon,top)=>{
  if(top<=0)return null;
  const id=top<3000?"surface":top<8000?"fl180":"fl300",g=grids.find(x=>x.layer.id===id);if(!g)return null;
  const x=Math.min(g.width-1,Math.round((((lon+180)%360+360)%360)/g.stepDeg)),y=Math.max(0,Math.min(g.height-1,Math.round((90-lat)/g.stepDeg))),i=(y*g.width+x)*2;
  const east=g.u.readInt16LE(i)/g.valueScale,north=g.v.readInt16LE(i)/g.valueScale;
  return Math.hypot(east,north)<150?{east,north}:null;
};}
async function ingest(){
  const step=Number(process.env.BAV_SATELLITE_STEP_DEG??.2);if(![.1,.2,.25,.5].includes(step))throw Error("Supported observation grid steps: .1, .2, .25, .5 degrees");
  const width=Math.round(360/step),height=Math.round(180/step),frames=[0,1].map(()=>({data:new Uint8Array(width*height*4),scores:new Float32Array(width*height).fill(999),sources:[]}));
  let complete=0;
  for(const satellite of ["19","18"])try{
    const lists=[];for(const product of products)lists.push(await productKeys(satellite,product));
    // Multiple processing revisions of one scan are not consecutive images.
    const masks=[...new Map(lists[0].map(key=>[scan(key),key])).values()];
    const common=masks.filter(key=>lists[1].some(k=>scan(k)===scan(key))&&lists[2].some(k=>scan(k)===scan(key))).slice(-2);
    if(!common.length)throw Error("No synchronized ACMF/CODF/ACHAF scans");
    for(let n=0;n<common.length;n++){
      const frame=frames[common.length===1?1:n],keys=lists.map(list=>list.filter(k=>scan(k)===scan(common[n])).at(-1));
      const source=await projectScan(satellite,keys,width,height,frame.data,frame.scores,frame===frames[0]);frame.sources.push(source);
      console.log(`Reprojected GOES-${satellite} ${source.scanStartAt} into ${width}x${height}`);
    }
    complete++;
  }catch(e){console.warn(`GOES-${satellite} unknown: ${e.message}`);}
  if(!complete||!frames[1].sources.length)throw Error("No usable satellite observations; previous artifact not replaced");
  const stamp=f=>f.sources.map(s=>s.scanEndAt).sort().at(-1),current=frames[1],previous=frames[0].sources.length?frames[0]:null;
  const intervalSeconds=previous?(Date.parse(stamp(current))-Date.parse(stamp(previous)))/1000:0;
  const windGrids=await winds(),motion=estimateSatelliteMotion(current.data,previous?.data??null,width,height,intervalSeconds,windPrior(windGrids));
  const counts={cloudy:0,reconstructed:0,clear:0,uncertain:0,unknown:0,opticalDepthMissing:0,topMissing:0,developing:0};
  for(let i=0;i<current.data.length;i+=4){const f=current.data[i+3],s=f&7;counts[s===1?"clear":s===2?"uncertain":s>=3?"cloudy":"unknown"]++;if(s>=3&&(f&24)===0)counts.reconstructed++;if(f&8)counts.opticalDepthMissing++;if(f&16)counts.topMissing++;if(motion[i+3]===255)counts.developing++;}
  const pack=f=>({observedAt:stamp(f),sources:f.sources,volume:Buffer.from(f.data).toString("base64")});
  const revision=createHash("sha256").update(current.data).update(previous?.data??new Uint8Array()).update(motion).update(JSON.stringify(current.sources)).digest("hex");
  const observation={version:2,mode:"satellite-observed",status:"ready",revision,current:pack(current),previous:previous?pack(previous):null,motion:Buffer.from(motion).toString("base64"),intervalSeconds,winds:windGrids.length?{source:"NOAA GFS",layer:windGrids.map(g=>g.layer.id).join(","),validAt:windGrids.map(g=>g.validAt).sort()[0]}:null,counts};
  const data={source:"NOAA GOES ABI",sourceResolutionDeg:step,displayResolutionDeg:step,cycleAt:stamp(current),validAt:stamp(current),fetchedAt:new Date().toISOString(),stale:false,width,height,west:-180,north:90,stepDeg:step,encoding:"rgba8-base64",fields:products,layers:[],satellite:observation};
  validateSatelliteCloudData(data);
  const output=resolve(process.env.BAV_SATELLITE_CLOUD_FILE??".bav-data/satellite-clouds/latest.json");
  if(!output.endsWith(".json"))throw Error("Observation output must be a JSON file");
  await mkdir(resolve(output,".."),{recursive:true});await writeFile(`${output}.part`,JSON.stringify(data));await rename(`${output}.part`,output);
  // Individual ingester-created cache files only; never recurse or delete a
  // user directory. Three hours of source files are retained for inspection.
  for(const name of await readdir(cache))if(/^OR_ABI-L2-(ACMF|CODF|ACHAF)-M\d_G(18|19)_s\d+_e\d+_c\d+\.nc$/.test(name)){const file=resolve(cache,name);if(Date.now()-(await stat(file)).mtimeMs>3*3600_000)await unlink(file);}
  console.log(JSON.stringify({output,observedAt:data.validAt,width,height,counts,windAssisted:!!observation.winds,intervalSeconds}));
}
await h5.ready;
if(process.argv.includes("--inspect")) {
  for(const product of products) {
    const key=(await productKeys("19",product)).at(-1),file=await download("19",key),f=new h5.File(file,"r");
    console.log(JSON.stringify({product,key,root:attrs(f),variables:f.keys().filter(k=>["BCM","ACM","Cloud_Probabilities","COD","HT","DQF","x","y","goes_imager_projection"].includes(k)).map(k=>({name:k,shape:f.get(k).shape,attributes:attrs(f.get(k))}))}));
    f.close();
  }
} else {
  do {try{await ingest();}catch(e){console.error(e.message);if(!process.argv.includes("--watch"))process.exitCode=1;}
    if(!process.argv.includes("--watch"))break;
    await new Promise(resolve=>setTimeout(resolve,300_000));
  } while(true);
}
