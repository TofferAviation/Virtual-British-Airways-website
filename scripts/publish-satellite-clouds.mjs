/** Publish ONLY the validated, generated NOAA feed. Never uploads raw NetCDF,
 * environment files, pilot data or source trees. The prerelease is reserved
 * for this single replaceable asset, keeping observations out of Git history. */
import { readFile, mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { validateSatelliteCloudData } from "../src/lib/radar-satellite-validation.ts";
import { SATELLITE_FEED_MAX_BYTES } from "../src/lib/radar-satellite-feed.ts";

const repository = "TofferAviation/Virtual-British-Airways-website";
const tag = "bav-satellite-observations-v2";
const marker = "BAV_MANAGED_SATELLITE_FEED_V2";
const gh = args => execFileSync("gh", [...args, "--repo", repository], { encoding: "utf8" });
const release = JSON.parse(gh(["release", "view", tag, "--json", "body,isDraft,isPrerelease,url"]));
if (release.isDraft || !release.isPrerelease || !release.body.startsWith(marker)) throw Error("Refusing to overwrite an unmanaged release");
const input = resolve(process.env.BAV_SATELLITE_CLOUD_FILE ?? ".bav-data/satellite-clouds/latest.json");
const data = validateSatelliteCloudData(JSON.parse(await readFile(input, "utf8")));
const compressed = gzipSync(Buffer.from(JSON.stringify(data)), { level: 6 });
if (compressed.length > SATELLITE_FEED_MAX_BYTES) throw Error("Observation feed exceeds the hosting limit");
const directory = await mkdtemp(join(tmpdir(), "bav-satellite-feed-"));
const output = join(directory, "latest.json.gz");
try {
  await writeFile(output, compressed);
  // Clobber is scoped to this one regenerable asset in our marked prerelease.
  gh(["release", "upload", tag, output, "--clobber"]);
  console.log(JSON.stringify({ release: release.url, observedAt: data.validAt, bytes: compressed.length, counts: data.satellite.counts }));
} finally {
  await unlink(output).catch(() => {});
  await rmdir(directory);
}
