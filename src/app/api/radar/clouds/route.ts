import { NextResponse } from "next/server";
import { gzipSync } from "node:zlib";
import { getRadarCloudData } from "@/lib/radar-clouds";
import type { RadarCloudData } from "@/lib/radar-external";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  };
}

export async function GET() {
  try {
    return NextResponse.json(transportCloudData(await getRadarCloudData()), {
      // Every viewer sees the same public GFS analysis. CDN caching prevents
      // several pilots from independently rebuilding the same large texture
      // set, while stale data is still better than an empty cloud globe.
      headers: { "Cache-Control": "public, max-age=300, s-maxage=1500, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json({ error: "The NOAA GFS cloud model is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
