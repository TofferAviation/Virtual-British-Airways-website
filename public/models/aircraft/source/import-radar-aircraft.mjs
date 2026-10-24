/** Offline asset preparation. Never reads or distributes an MSFS/FSLTL installation. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pipeline from "gltf-pipeline";

const revision = "dd53267690c6a4ecbb290a3acf0284333a5d68a9";
const repository = "Flightradar24/fr24-3d-models";
const destination = path.resolve(fileURLToPath(new URL("../public/models/aircraft/", import.meta.url)));
const types = ["a318", "a319", "a320", "a321", "a332", "a333", "a359", "a380", "b738", "b744", "b772", "b773", "b788", "b789"];
const treeResponse = await fetch(`https://api.github.com/repos/${repository}/git/trees/${revision}?recursive=1`);
if (!treeResponse.ok) throw new Error(`Model inventory: HTTP ${treeResponse.status}`);
const tree = (await treeResponse.json()).tree;
const entries = new Map(tree.filter(e => e.type === "blob").map(e => [e.path, e]));
async function download(relative, target) {
  const expected = entries.get(relative);
  if (!expected) throw new Error(`Missing pinned asset: ${relative}`);
  const output = path.resolve(destination, target);
  if (!output.startsWith(destination + path.sep)) throw new Error("Unsafe asset destination");
  let bytes;
  try { bytes = await readFile(output); } catch { /* First import. */ }
  const hash = data => createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
  if (!bytes || hash(bytes) !== expected.sha) {
    const response = await fetch(`https://raw.githubusercontent.com/${repository}/${revision}/${relative}`);
    if (!response.ok) throw new Error(`${relative}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== expected.sha) throw new Error(`Asset checksum mismatch: ${relative}`);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, bytes);
  }
  return bytes;
}
await mkdir(destination, { recursive: true });
await download("LICENSE", "LICENSE.txt");
await download("README.md", "UPSTREAM-README.md");
const manifest = { repository, revision, license: "GPL-2.0", convertedWith: "gltf-pipeline 4.3.1", models: [] };
for (const type of types) {
  const original = await download(`models/${type}.glb`, `source/${type}/original.glb`);
  const sourceFolder = type === "a359" ? "a350" : type;
  const sources = [...entries.keys()].filter(p => p.startsWith(`source/${sourceFolder}/`));
  if (!sources.length) throw new Error(`No editable source for ${type}`);
  for (const source of sources) await download(source, `source/${type}/${path.basename(source)}`);
  const result = await pipeline.processGlb(original, { keepUnusedElements: false });
  const jsonLength = result.glb.readUInt32LE(12);
  const document = JSON.parse(result.glb.toString("utf8", 20, 20 + jsonLength));
  if (document.asset.version !== "2.0") throw new Error(`${type}: conversion did not produce glTF 2.0`);
  await writeFile(path.join(destination, `${type}.glb`), result.glb);
  manifest.models.push({ type, file: `${type}.glb`, bytes: result.glb.length, sourceFiles: ["original.glb", ...sources.map(p => path.basename(p))] });
  console.log(`${type}: glTF 2.0, ${(result.glb.length / 1048576).toFixed(2)} MiB; editable source included`);
}
await writeFile(path.join(destination, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await mkdir(path.join(destination,"source"),{recursive:true});
await writeFile(path.join(destination,"source/import-radar-aircraft.mjs"),await readFile(fileURLToPath(import.meta.url)));
const sourcesHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Aircraft sources and licence</title><body><h1>Aircraft sources and licence</h1><p>FlightGear / FGMEMBERS authors, via Flightradar24/fr24-3d-models, revision ${revision}. Modified by British Airways Virtual: legacy GLB converted to glTF 2.0, 24 October 2026. No warranty. No FSLTL assets.</p><p><a href="LICENSE.txt">GNU GPLv2 licence</a> · <a href="NOTICE.md">Change notice</a> · <a href="UPSTREAM-README.md">Original credits</a> · <a href="source/import-radar-aircraft.mjs">Conversion script</a></p><ul>${manifest.models.map(model=>`<li>${model.type}: ${model.sourceFiles.map(file=>`<a href="source/${model.type}/${encodeURIComponent(file)}">${file}</a>`).join(" · ")}</li>`).join("")}</ul></body></html>`;
await writeFile(path.join(destination,"SOURCES.html"),sourcesHtml);
