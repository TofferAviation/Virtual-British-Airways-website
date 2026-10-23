import { gunzipSync } from "node:zlib";
import type { RadarCloudData } from "./radar-external";
import { validateSatelliteCloudData } from "./radar-satellite-validation.ts";

// Public, generated NOAA data only. No host credentials or arbitrary URL input.
export const SATELLITE_FEED_URL = "https://github.com/TofferAviation/Virtual-British-Airways-website/releases/download/bav-satellite-observations-v2/latest.json.gz";
export const SATELLITE_FEED_MAX_BYTES = 8 * 1024 ** 2;
export const SATELLITE_FEED_MAX_JSON_BYTES = 120 * 1024 ** 2;

export function decodeSatelliteFeed(bytes: Uint8Array, now = Date.now()): RadarCloudData {
  if (bytes.byteLength > SATELLITE_FEED_MAX_BYTES) throw Error("Oversized satellite feed");
  const json = gunzipSync(bytes, { maxOutputLength: SATELLITE_FEED_MAX_JSON_BYTES });
  return validateSatelliteCloudData(JSON.parse(json.toString("utf8")), now);
}

export async function fetchSatelliteFeed(fetcher: typeof fetch = fetch, now = Date.now()) {
  const response = await fetcher(SATELLITE_FEED_URL, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok || !response.body) throw Error("Satellite feed unavailable");
  // GitHub release downloads redirect to GitHub's signed asset CDN.
  if (response.url && !["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"].includes(new URL(response.url).hostname)) throw Error("Unexpected satellite feed origin");
  const length = Number(response.headers.get("content-length"));
  if (length > SATELLITE_FEED_MAX_BYTES) throw Error("Oversized satellite feed");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > SATELLITE_FEED_MAX_BYTES) throw Error("Oversized satellite feed");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return decodeSatelliteFeed(Buffer.concat(chunks, size), now);
}

let cached: { data: RadarCloudData; refreshAfter: number } | null = null;
let pending: Promise<RadarCloudData> | null = null;
export async function getHostedSatelliteCloudData(): Promise<RadarCloudData> {
  const now = Date.now();
  if (cached && now < cached.refreshAfter) return validateSatelliteCloudData(cached.data, now, false);
  if (!pending) pending = fetchSatelliteFeed().then(data => {
    cached = { data, refreshAfter: Date.now() + 60_000 };
    return data;
  }).finally(() => { pending = null; });
  // An unsuccessful refresh does not silently retain a last-good fallback.
  return pending;
}
