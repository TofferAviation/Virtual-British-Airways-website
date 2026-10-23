// Generated assets replace >260,000 synchronous CPU noise evaluations on each
// pilot's first visit. Re-run only when radar-cloud-noise.ts changes.
import { mkdir, writeFile } from "node:fs/promises";
import { bakeCloudNoise } from "../src/lib/radar-cloud-noise.ts";
const directory = new URL("../public/textures/clouds/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, size, detail] of [["mass-v1", 64, false], ["detail-v1", 32, true]]) {
  const data = bakeCloudNoise(size, detail);
  await writeFile(new URL(`${name}.rgba`, directory), data);
  console.log(`${name}: ${data.byteLength} bytes, ${size}³ RGBA`);
}
