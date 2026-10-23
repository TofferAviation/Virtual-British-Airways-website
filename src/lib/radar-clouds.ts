import "server-only";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { RadarCloudData } from "@/lib/radar-external";
import { validateSatelliteCloudData, unknownSatelliteCloudData } from "@/lib/radar-satellite-validation";

// Heavy NetCDF ingestion is an independent job, not a per-viewer web request.
// The ingester atomically replaces this file. It is not a public upload path.
let cached: { data: RadarCloudData; mtime: number } | null = null;
export async function getRadarCloudData(): Promise<RadarCloudData> {
  const now=Date.now();
  try {
    const file=resolve(process.env.BAV_SATELLITE_CLOUD_FILE??".bav-data/satellite-clouds/latest.json");
    const info=await stat(/*turbopackIgnore: true*/ file);
    if(info.size>120*1024**2)throw Error("Oversized satellite observation artifact");
    let data:RadarCloudData;
    if(cached&&cached.mtime===info.mtimeMs)data=cached.data;
    else {data=validateSatelliteCloudData(JSON.parse(await readFile(/*turbopackIgnore: true*/ file,"utf8")),now);cached={data,mtime:info.mtimeMs};}
    return validateSatelliteCloudData(data,now,false);
  } catch(error) {
    const missing=(error as NodeJS.ErrnoException)?.code==="ENOENT";
    return unknownSatelliteCloudData(missing?"No satellite observation field is loaded. Coverage is unknown; the ingestion job must run.":"Satellite observations are unavailable, stale or invalid. Coverage is unknown.",now);
  }
}
