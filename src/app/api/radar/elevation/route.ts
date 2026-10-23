import sharp from "sharp";
import { geographicTileBounds } from "@/lib/radar-globe-geodesy";
import { ELEVATION_GRID, mercatorPosition, terrariumHeight } from "@/lib/radar-globe-elevation";

export const runtime = "nodejs";
type Dem = { heights: Float32Array; size: number };
// Fixed upstream, bounded decoded cache and shared in-flight work. No API key.
const cache = new Map<string, Promise<Dem>>();
let active = 0;
const waiting: Array<() => void> = [];
async function dem(z: number, x: number, y: number) {
  const key = `${z}/${x}/${y}`;
  let result = cache.get(key);
  if (result) { cache.delete(key); cache.set(key, result); return result; }
  result = (async () => {
    if (active >= 3) await new Promise<void>(resolve => waiting.push(resolve));
    else active++;
    try {
      const response = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`, { signal: AbortSignal.timeout(12000), next: { revalidate: 604800 } });
      if (!response.ok || !response.headers.get("content-type")?.includes("image/png")) throw new Error("DEM unavailable");
      const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()), { limitInputPixels: 512 * 512 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      if (info.width !== 256 || info.height !== 256 || info.channels !== 3) throw new Error("Unexpected DEM dimensions");
      const heights = new Float32Array(256 * 256);
      for (let i = 0; i < heights.length; i++) heights[i] = terrariumHeight(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
      return { heights, size: 256 };
    } finally { const next=waiting.shift(); if(next)next();else active--; }
  })();
  cache.set(key, result);
  result.catch(() => { if (cache.get(key) === result) cache.delete(key); });
  while (cache.size > 64) cache.delete(cache.keys().next().value!);
  return result;
}
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const z = Number(query.get("z")), x = Number(query.get("x")), y = Number(query.get("y"));
  if (!query.has("z") || ![z,x,y].every(Number.isInteger) || z < 4 || z > 14 || x < 0 || x >= 2 ** (z + 1) || y < 0 || y >= 2 ** z)
    return new Response("Invalid elevation tile", { status: 400 });
  const bounds = geographicTileBounds(z, x, y), size = ELEVATION_GRID;
  // Geographic cells have much taller Mercator footprints near the poles.
  // Lower the source level there to bound fan-out, rather than downloading a world strip.
  const latitude = Math.max(Math.abs(bounds.north), Math.abs(bounds.south));
  const level = Math.max(0, Math.min(14, z + 1 + Math.floor(Math.log2(Math.max(0.02, Math.cos(latitude * Math.PI / 180))))));
  const n = 2 ** level, points: Array<{ x: number; y: number; key: string } | null> = [];
  const keys = new Map<string, [number,number]>();
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const lat = bounds.north - (bounds.north - bounds.south) * row / (size - 1), lon = bounds.west + (bounds.east - bounds.west) * col / (size - 1);
    // Mercator has no polar cap. Never stretch the 85° sample to the pole.
    if (Math.abs(lat) > 85.05112878) { points.push(null); continue; }
    const p = mercatorPosition(lat, lon, level), tx = Math.min(n - 1, Math.floor(p.x)), ty = Math.min(n - 1, Math.floor(p.y)), key = `${tx}/${ty}`;
    points.push({ x: (p.x - tx) * 256, y: (p.y - ty) * 256, key }); keys.set(key, [tx,ty]);
  }
  if (keys.size > 24 || waiting.length > 128) return new Response("Elevation busy", { status: 503, headers: { "Retry-After": "10" } });
  try {
    const tiles = new Map(await Promise.all([...keys].map(async ([key,[tx,ty]]) => [key, await dem(level,tx,ty)] as const)));
    const buffer = new ArrayBuffer(size * size * 4), view = new DataView(buffer);
    points.forEach((p, i) => {
      let h = 0;
      if (p) {
        const tile = tiles.get(p.key)!;
        // DEM pixels are cell centres. Interpolate heights, never RGB channels.
        const px = Math.max(0, Math.min(255, p.x - 0.5)), py = Math.max(0, Math.min(255, p.y - 0.5));
        const cx = Math.min(254, Math.floor(px)), cy = Math.min(254, Math.floor(py)), dx = px - cx, dy = py - cy, a = cy * 256 + cx;
        h = (tile.heights[a] * (1-dx) + tile.heights[a+1] * dx) * (1-dy) + (tile.heights[a+256] * (1-dx) + tile.heights[a+257] * dx) * dy;
      }
      // Bathymetry is not a visible seabed: keep oceans at sea level.
      view.setFloat32(i * 4, Math.max(0, Math.min(9000, h)), true);
    });
    return new Response(buffer, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "public, max-age=604800, stale-while-revalidate=604800", "X-Elevation-Grid": String(size), "X-Elevation-Source": "Mapzen Terrain Tiles / AWS Open Data", "X-Elevation-Polar-Limit": "85.05112878", "X-Elevation-Datum": "source-geoid; visual-relief; not-for-navigation" } });
  } catch {
    return new Response("Elevation unavailable — retain parent terrain", { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
  }
}
