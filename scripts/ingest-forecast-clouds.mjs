/** Shared global model preparation, never run by a viewer's web request.
 * Downloads bounded byte ranges, not the ~500 MB whole GFS GRIB file. */
import { GribMessage, parseGribIndex } from "@mattnucc/gribberish";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FORECAST_PROFILES, forecastPressureHeight, sampleForecastGrid, validateForecastCloudData } from "../src/lib/radar-cloud-forecast.ts";

const pressures=[1000,925,850,700,500,300,200,100];
const bucket="https://noaa-gfs-bdp-pds.s3.amazonaws.com";
async function boundedResponse(response,limit){
  if(!response.ok||!response.body||Number(response.headers.get("content-length"))>limit)throw Error(`GFS response ${response.status} or oversized data`);
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error("GFS size limit exceeded");chunks.push(value);}}finally{await reader.cancel();}
  return Buffer.concat(chunks,size);
}
export function forecastCandidates(now=new Date()){
  const cycle=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),Math.floor(now.getUTCHours()/6)*6));
  return Array.from({length:3},(_,i)=>{const date=new Date(+cycle-i*6*3600_000),hour=String(date.getUTCHours()).padStart(2,"0"),forecastHour=Math.max(1,Math.floor((+now-+date)/3600_000));return {date,forecastHour,url:`${bucket}/gfs.${date.toISOString().slice(0,10).replaceAll("-","")}/${hour}/atmos/gfs.t${hour}z.pgrb2.0p25.f${String(forecastHour).padStart(3,"0")}`};});
}
async function loadForecast(candidate){
  const entries=parseGribIndex((await boundedResponse(await fetch(candidate.url+".idx",{signal:AbortSignal.timeout(20_000)}),256*1024)).toString("utf8"));
  const requirements=pressures.map(p=>["HGT",`${p} mb`]);requirements.push(["HGT","surface"]);
  for(const p of FORECAST_PROFILES)requirements.push([p.coverageField,`${p.id} cloud layer`],["PRES",`${p.id} cloud bottom level`],["PRES",`${p.id} cloud top level`]);
  const fields=new Map();let referenceDate,validDate;
  for(const [variable,level] of requirements){
    const matches=entries.filter(e=>e.var===variable&&e.level===level);
    const entry=matches.find(e=>e.forecastTime===`${candidate.forecastHour} hour fcst`)??matches.find(e=>e.forecastTime.endsWith("ave fcst"));
    if(!entry?.length||entry.length>8*1024**2)throw Error(`Missing or oversized GFS ${variable}:${level}`);
    const end=entry.offset+entry.length-1,response=await fetch(candidate.url,{headers:{Range:`bytes=${entry.offset}-${end}`},signal:AbortSignal.timeout(30_000)});
    if(response.status!==206||!response.headers.get("content-range")?.startsWith(`bytes ${entry.offset}-${end}/`))throw Error("GFS byte range was not honoured");
    const bytes=await boundedResponse(response,8*1024**2);if(bytes.length!==entry.length)throw Error("Truncated GFS field");
    const message=GribMessage.parseFromBuffer(bytes,0);
    const expectedUnits=variable==="PRES"?["pa"]:variable==="HGT"?["gpm","m"]:["%"];
    if(!expectedUnits.includes(message.units.toLowerCase()))throw Error(`Unexpected GFS ${variable} units: ${message.units}`);
    if(message.gridShape.cols!==1440||message.gridShape.rows!==721||!message.isRegularGrid)throw Error("Unexpected GFS grid");
    const coords=message.latlngAdjusted(true,true);
    if(Math.abs(coords.latitude[0]-90)>1e-6||Math.abs(coords.longitude[0]+180)>1e-6)throw Error("GFS navigation was not north-up / west-first");
    if(referenceDate&&+referenceDate!==+message.referenceDate)throw Error("Mixed GFS cycles");
    referenceDate=message.referenceDate;
    // Averaged cloud boundary fields report their interval's beginning as
    // forecastDate; require the published interval END to match coverage.
    const endDate=message.forecastEndDate??message.forecastDate;
    if(+endDate!==+candidate.date+candidate.forecastHour*3600_000)throw Error("Mismatched GFS forecast intervals");
    validDate=endDate;
    fields.set(`${variable}:${level}`,Float32Array.from(message.dataAdjusted(true,true)));
    console.log(`Decoded ${variable}:${level}`);
  }
  const width=1440,height=720;
  const layers=FORECAST_PROFILES.map(profile=>{
    const volume=new Uint8Array(width*height*4),cover=fields.get(`${profile.coverageField}:${profile.id} cloud layer`),bottom=fields.get(`PRES:${profile.id} cloud bottom level`),top=fields.get(`PRES:${profile.id} cloud top level`),terrain=fields.get("HGT:surface");
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const sample=field=>sampleForecastGrid(field,width,height+1,x+.5,y+.5),i=(y*width+x)*4,coverage=sample(cover);
      if(!Number.isFinite(coverage)||coverage<0||coverage>100)continue;
      if(coverage<.2){volume[i+3]=255;continue;}
      const heights=pressures.map(p=>[p*100,sample(fields.get(`HGT:${p} mb`))]);
      const base=forecastPressureHeight(sample(bottom),heights),ceiling=forecastPressureHeight(sample(top),heights),ground=sample(terrain);
      if(base===null||ceiling===null||!Number.isFinite(ground))continue;
      const baseM=Math.max(100,ground+100,base),topM=Math.min(18000,ceiling);
      if(topM<baseM+150)continue;
      volume.set([Math.round(coverage/100*255),Math.round(baseM/100),Math.max(Math.round(baseM/100)+1,Math.round(topM/100)),255],i);
    }
    return {...profile,volume:Buffer.from(volume).toString("base64")};
  });
  return validateForecastCloudData({source:"NOAA GFS",forecast:{mode:"global-forecast",model:"GFS",forecastHour:candidate.forecastHour,sourceUrl:candidate.url,layerBounds:"time-averaged-pressure-interpolated-height"},sourceResolutionDeg:.25,displayResolutionDeg:.25,cycleAt:referenceDate.toISOString(),validAt:validDate.toISOString(),fetchedAt:new Date().toISOString(),stale:false,width,height,west:-180,north:90,stepDeg:.25,encoding:"rgba8-base64",fields:[...fields.keys()],layers});
}
export async function ingestForecast(){
  let failure;
  for(const candidate of forecastCandidates())try{return await loadForecast(candidate);}catch(error){failure=error;console.warn(`${candidate.url}: ${error.message}`);}
  throw failure;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const data=await ingestForecast(),file=resolve(process.env.BAV_FORECAST_CLOUD_FILE??".bav-data/forecast-clouds/latest.json");
  await mkdir(dirname(file),{recursive:true});await writeFile(`${file}.part`,JSON.stringify(data));await rename(`${file}.part`,file);
  console.log(JSON.stringify({file,cycleAt:data.cycleAt,validAt:data.validAt,dimensions:[data.width,data.height],rssMB:Math.round(process.memoryUsage().rss/1024**2)}));
}
