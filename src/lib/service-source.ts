import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type ServiceSourceFile = {
  path: string;
  size: number;
  updatedAt: string;
};

export type ServiceSourceDocument = ServiceSourceFile & {
  content: string;
  hash: string;
  language: string;
};

const PROJECT_ROOT = path.resolve(process.cwd());
const DATA_ROOT = path.join(PROJECT_ROOT, ".bav-data");
const BACKUP_ROOT = path.join(DATA_ROOT, "source-backups");
const MAX_SOURCE_BYTES = 1_500_000;

const ROOT_FILES = new Set([
  "package.json",
  "tsconfig.json",
  "next-env.d.ts",
  "next.config.ts",
  "next.config.js",
  "next.config.mjs",
  "eslint.config.js",
  "eslint.config.mjs",
  "postcss.config.js",
  "postcss.config.mjs",
  "README.md",
  ".gitignore",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".json",
  ".md",
  ".html",
  ".txt",
  ".svg",
  ".yml",
  ".yaml",
]);

const BLOCKED_SEGMENTS = new Set([
  ".git",
  ".next",
  ".bav-data",
  "node_modules",
  "coverage",
  "dist",
  "build",
]);

function normalisePath(input: string) {
  const clean = input.replace(/\\/g, "/").trim();
  if (!clean || clean.includes("\0") || clean.startsWith("/") || /^[A-Za-z]:\//.test(clean)) {
    throw new Error("Invalid source path.");
  }
  const normalised = path.posix.normalize(clean);
  if (normalised === ".." || normalised.startsWith("../") || normalised.includes("/../")) {
    throw new Error("Source path must stay inside the website project.");
  }
  return normalised;
}

function hasBlockedSegment(relativePath: string) {
  return relativePath.split("/").some((segment) => BLOCKED_SEGMENTS.has(segment) || segment.toLowerCase().startsWith(".env"));
}

export function isEditableSourcePath(input: string) {
  let relativePath: string;
  try {
    relativePath = normalisePath(input);
  } catch {
    return false;
  }
  if (hasBlockedSegment(relativePath)) return false;
  if (ROOT_FILES.has(relativePath)) return true;
  if (!(relativePath.startsWith("src/") || relativePath.startsWith("public/"))) return false;
  return TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

function absoluteFor(relativePath: string) {
  const absolute = path.resolve(PROJECT_ROOT, relativePath);
  const relative = path.relative(PROJECT_ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Source path must stay inside the website project.");
  }
  return absolute;
}

async function assertEditableRegularFile(input: string) {
  const relativePath = normalisePath(input);
  if (!isEditableSourcePath(relativePath)) throw new Error("That file is not available in Service Settings.");
  const absolute = absoluteFor(relativePath);
  const info = await lstat(absolute);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error("Only regular project source files can be edited.");
  if (info.size > MAX_SOURCE_BYTES) throw new Error("That source file is too large for the web editor.");
  return { relativePath, absolute, info };
}

function hashContent(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function languageFor(relativePath: string) {
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === ".tsx" || ext === ".ts") return "TypeScript";
  if (ext === ".jsx" || ext === ".js" || ext === ".mjs" || ext === ".cjs") return "JavaScript";
  if (ext === ".css" || ext === ".scss") return "CSS";
  if (ext === ".json") return "JSON";
  if (ext === ".md") return "Markdown";
  if (ext === ".html") return "HTML";
  if (ext === ".svg") return "SVG";
  if (ext === ".yml" || ext === ".yaml") return "YAML";
  return "Plain Text";
}

async function walkDirectory(relativeDirectory: string, output: ServiceSourceFile[]) {
  const absoluteDirectory = path.join(PROJECT_ROOT, relativeDirectory);
  let entries;
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = path.posix.join(relativeDirectory.replace(/\\/g, "/"), entry.name);
    if (hasBlockedSegment(relativePath) || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      await walkDirectory(relativePath, output);
      continue;
    }
    if (!entry.isFile() || !isEditableSourcePath(relativePath)) continue;
    try {
      const info = await stat(path.join(PROJECT_ROOT, relativePath));
      if (info.size > MAX_SOURCE_BYTES) continue;
      output.push({ path: relativePath, size: info.size, updatedAt: info.mtime.toISOString() });
    } catch {
      // Ignore files that disappear during a development rebuild.
    }
  }
}

export async function listServiceSourceFiles() {
  const output: ServiceSourceFile[] = [];
  for (const rootFile of ROOT_FILES) {
    try {
      const info = await stat(path.join(PROJECT_ROOT, rootFile));
      if (info.isFile() && info.size <= MAX_SOURCE_BYTES) {
        output.push({ path: rootFile, size: info.size, updatedAt: info.mtime.toISOString() });
      }
    } catch {
      // Optional root config file is not present.
    }
  }
  await walkDirectory("src", output);
  await walkDirectory("public", output);
  return output.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readServiceSourceFile(input: string): Promise<ServiceSourceDocument> {
  const { relativePath, absolute } = await assertEditableRegularFile(input);
  const [content, info] = await Promise.all([readFile(absolute, "utf8"), stat(absolute)]);
  return {
    path: relativePath,
    content,
    hash: hashContent(content),
    language: languageFor(relativePath),
    size: Buffer.byteLength(content, "utf8"),
    updatedAt: info.mtime.toISOString(),
  };
}

export async function writeServiceSourceFile(input: {
  path: string;
  content: string;
  expectedHash?: string;
}) {
  if (typeof input.content !== "string") throw new Error("Source content must be text.");
  if (Buffer.byteLength(input.content, "utf8") > MAX_SOURCE_BYTES) throw new Error("That source file is too large to save here.");

  const current = await readServiceSourceFile(input.path);
  if (input.expectedHash && current.hash !== input.expectedHash) {
    throw new Error("This file changed on disk after you opened it. Reload it before saving to avoid overwriting newer work.");
  }

  const { relativePath, absolute } = await assertEditableRegularFile(input.path);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_ROOT, stamp, relativePath);
  await mkdir(path.dirname(backupPath), { recursive: true });
  await writeFile(backupPath, current.content, "utf8");

  // Direct writes are used here because this project is primarily developed on Windows.
  // A backup is already safely stored before the file is changed.
  await writeFile(absolute, input.content, "utf8");

  return readServiceSourceFile(relativePath);
}
