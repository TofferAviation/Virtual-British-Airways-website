import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-auth";
import { addAudit, getStaffState, hasPermission, saveStaffState } from "@/lib/staff-store";

const allowedTypes = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);

function safeBaseName(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "news-image";
}

export async function POST(request: NextRequest) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "Staff authentication required." }, { status: 401 });
  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!actor || !hasPermission(state, actor, "news.edit")) {
    return NextResponse.json({ error: "Permission required: news.edit." }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const upload = formData.get("file");
    if (!(upload instanceof File)) throw new Error("Choose an image to upload.");
    if (!allowedTypes.has(upload.type)) throw new Error("Only PNG, JPG, WEBP and GIF newsroom images are supported.");
    if (upload.size > 12 * 1024 * 1024) throw new Error("Newsroom images must be 12 MB or smaller.");

    const extension = allowedTypes.get(upload.type)!;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${safeBaseName(upload.name)}-${stamp}${extension}`;
    const bytes = Buffer.from(await upload.arrayBuffer());

    const persistentDirectory = path.join(process.cwd(), ".bav-data", "news-media");
    const publicDirectory = path.join(process.cwd(), "public", "uploads", "news");
    await Promise.all([
      mkdir(persistentDirectory, { recursive: true }),
      mkdir(publicDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(persistentDirectory, filename), bytes),
      writeFile(path.join(publicDirectory, filename), bytes),
    ]);

    const url = `/api/news-media?file=${encodeURIComponent(filename)}`;
    addAudit(state, {
      actorEmail: actor.email,
      actorName: actor.name,
      action: "news.media.uploaded",
      details: `Uploaded newsroom image ${filename}.`,
    });
    await saveStaffState(state);
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not upload newsroom image." }, { status: 400 });
  }
}
