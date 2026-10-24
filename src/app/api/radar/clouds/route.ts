import { NextResponse } from "next/server";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { getRadarCloudData } from "@/lib/radar-clouds";
import type { RadarCloudData } from "@/lib/radar-external";
import { getForecastCloudData } from "@/lib/radar-cloud-forecast-feed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const cachedTransport=new Map<string,{raw:RadarCloudData;packed:RadarCloudData}>();

function gzipBase64(value: string) {
  return gzipSync(Buffer.from(value, "base64"), { level: 6 }).toString("base64");
}

/**
 * The compact global cloud textures are still too large to safely return as
 * plain JSON from a serverless route. Compress only their transport; the
 * browser expands the textures before uploading them to WebGL.
 */
function transportCloudData(data: RadarCloudData): RadarCloudData {
  return {
    ...data,
    encoding: "rgba8-gzip-base64",
    layers: data.layers.map((layer) => ({
      ...layer,
      volume: gzipBase64(layer.volume),
    })),
    satellite: data.satellite ? {...data.satellite,current:{...data.satellite.current,volume:gzipBase64(data.satellite.current.volume)},previous:data.satellite.previous?{...data.satellite.previous,volume:gzipBase64(data.satellite.previous.volume)}:null,motion:gzipBase64(data.satellite.motion)} : undefined,
  };
}

export async function GET(request:Request) {
  // Default remains observation-only for existing consumers. Global forecast
  // requires an explicit request and has a separate cache and provenance.
  const mode=new URL(request.url).searchParams.get("mode")??"satellite";
  if(!["satellite","forecast"].includes(mode))return NextResponse.json({error:"Unknown cloud mode"},{status:400});
  try {
    const raw=await (mode==="forecast"?getForecastCloudData():getRadarCloudData());
    const etag=`"${createHash("sha256").update(`${mode}/${raw.cycleAt}/${raw.validAt}/${raw.fetchedAt}/${raw.satellite?.revision??""}`).digest("hex").slice(0,24)}"`;
    const headers={"Cache-Control":mode==="forecast"?"public, max-age=120, s-maxage=300":"public, max-age=30, s-maxage=30","ETag":etag};
    if(request.headers.get("if-none-match")===etag)return new NextResponse(null,{status:304,headers});
    if(cachedTransport.get(mode)?.raw!==raw)cachedTransport.set(mode,{raw,packed:transportCloudData(raw)});
    return NextResponse.json(cachedTransport.get(mode)!.packed, {
      // Clear/unknown are meaningful states. Never retain stale cloud cover.
      headers,
    });
  } catch {
    return NextResponse.json({ error: mode==="forecast"?"Global forecast unavailable; no generated replacement weather.":"Satellite cloud coverage is unknown." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
