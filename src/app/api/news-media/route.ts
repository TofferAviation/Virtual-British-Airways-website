import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

const mimeByExtension: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function safeFilename(value: string | null) {
  if (!value) return "";
  const filename = path.basename(value.trim());
  if (!filename || filename !== value.trim() || !/^[a-zA-Z0-9._-]+$/.test(filename)) return "";
  return filename;
}

export async function GET(request: NextRequest) {
  const filename = safeFilename(request.nextUrl.searchParams.get("file"));
  if (!filename) return NextResponse.json({ error: "Invalid newsroom media filename." }, { status: 400 });

  const extension = path.extname(filename).toLowerCase();
  const contentType = mimeByExtension[extension];
  if (!contentType) return NextResponse.json({ error: "Unsupported newsroom media type." }, { status: 415 });

  const candidates = [
    path.join(process.cwd(), ".bav-data", "news-media", filename),
    path.join(process.cwd(), "public", "uploads", "news", filename),
  ];

  for (const candidate of candidates) {
    try {
      const bytes = await readFile(candidate);
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    } catch {
      // Try the next supported storage location.
    }
  }

  return NextResponse.json({ error: "Newsroom media not found." }, { status: 404 });
}
