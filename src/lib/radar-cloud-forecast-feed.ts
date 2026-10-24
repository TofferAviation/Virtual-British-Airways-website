import { gunzipSync } from "node:zlib";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { RadarCloudData } from "./radar-external";
import { validateForecastCloudData } from "./radar-cloud-forecast.ts";

export const FORECAST_FEED_URL="https://github.com/TofferAviation/Virtual-British-Airways-website/releases/download/bav-global-forecast-v1/latest.json.gz";
export const FORECAST_FEED_MAX_BYTES=8*1024**2;
export function decodeForecastFeed(bytes:Uint8Array,now=Date.now()){
  if(bytes.length>FORECAST_FEED_MAX_BYTES)throw Error("Oversized forecast feed");
  return validateForecastCloudData(JSON.parse(gunzipSync(bytes,{maxOutputLength:24*1024**2}).toString("utf8")),now);
}
export async function fetchForecastFeed(fetcher:typeof fetch=fetch,now=Date.now()){
  const response=await fetcher(FORECAST_FEED_URL,{cache:"no-store",signal:AbortSignal.timeout(12_000)});
  if(!response.ok||!response.body)throw Error("Global forecast feed unavailable");
  if(response.url&&!["github.com","release-assets.githubusercontent.com","objects.githubusercontent.com"].includes(new URL(response.url).hostname))throw Error("Unexpected forecast origin");
  if(Number(response.headers.get("content-length"))>FORECAST_FEED_MAX_BYTES)throw Error("Oversized forecast feed");
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>FORECAST_FEED_MAX_BYTES)throw Error("Oversized forecast feed");chunks.push(value);}}finally{await reader.cancel();}
  return decodeForecastFeed(Buffer.concat(chunks,size),now);
}
let cached:{data:RadarCloudData;refreshAfter:number;mtime?:number}|null=null;
let pending:Promise<RadarCloudData>|null=null;
export async function getForecastCloudData():Promise<RadarCloudData>{
  const now=Date.now();
  if(cached&&now<cached.refreshAfter)return validateForecastCloudData(cached.data,now,false);
  if(!pending)pending=(async()=>{
    let data:RadarCloudData;
    if(process.env.NODE_ENV!=="production"||process.env.BAV_FORECAST_CLOUD_FILE){
      const file=resolve(/*turbopackIgnore: true*/ process.env.BAV_FORECAST_CLOUD_FILE??".bav-data/forecast-clouds/latest.json");
      const info=await stat(/*turbopackIgnore: true*/ file);
      if(info.size>24*1024**2)throw Error("Oversized forecast artifact");
      data=cached?.mtime===info.mtimeMs?validateForecastCloudData(cached.data,now,false):validateForecastCloudData(JSON.parse(await readFile(/*turbopackIgnore: true*/ file,"utf8")),now);
      cached={data,refreshAfter:now+60_000,mtime:info.mtimeMs};
    }else{data=await fetchForecastFeed();cached={data,refreshAfter:now+10*60_000};}
    return data;
  })().finally(()=>{pending=null;});
  return pending;
}
