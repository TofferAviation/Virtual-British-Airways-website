import { NextResponse } from "next/server";
import { gzipSync } from "node:zlib";
import { getRadarCloudData } from "@/lib/radar-clouds";
import type { RadarCloudData } from "@/lib/radar-external";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
let cachedTransport:{raw:RadarCloudData;packed:RadarCloudData}|null=null;

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

export async function GET() {
  try {
    const raw=await getRadarCloudData();
    if(cachedTransport?.raw!==raw)cachedTransport={raw,packed:transportCloudData(raw)};
    return NextResponse.json(cachedTransport!.packed, {
      // Clear/unknown are meaningful states. Never retain stale cloud cover.
      headers: { "Cache-Control": "public, max-age=30, s-maxage=30" },
    });
  } catch {
    return NextResponse.json({ error: "Satellite cloud coverage is unknown." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
