import { NextRequest, NextResponse } from "next/server";
import { SERVICE_SOURCE_PERMISSION } from "@/lib/permissions";
import { getStaffSession } from "@/lib/staff-auth";
import { listServiceSourceFiles, readServiceSourceFile, writeServiceSourceFile } from "@/lib/service-source";
import { addAudit, getStaffState, hasPermission, saveStaffState } from "@/lib/staff-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function sourceContext() {
  const session = await getStaffSession();
  if (!session) return null;
  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!actor || !hasPermission(state, actor, SERVICE_SOURCE_PERMISSION)) return null;
  return { session, state, actor };
}

export async function GET(request: NextRequest) {
  const context = await sourceContext();
  if (!context) return jsonError("Service Settings access is not available for this staff account.", 403);

  try {
    const sourcePath = request.nextUrl.searchParams.get("path");
    if (sourcePath) {
      const document = await readServiceSourceFile(sourcePath);
      return NextResponse.json({ document });
    }
    const files = await listServiceSourceFiles();
    return NextResponse.json({ files });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load website source files.");
  }
}

export async function PUT(request: NextRequest) {
  const context = await sourceContext();
  if (!context) return jsonError("Service Settings access is not available for this staff account.", 403);
  const { state, actor } = context;
  const body = (await request.json().catch(() => null)) as { path?: unknown; content?: unknown; expectedHash?: unknown } | null;
  if (!body || typeof body.path !== "string" || typeof body.content !== "string") {
    return jsonError("A source path and text content are required.");
  }

  try {
    const document = await writeServiceSourceFile({
      path: body.path,
      content: body.content,
      expectedHash: typeof body.expectedHash === "string" ? body.expectedHash : undefined,
    });
    addAudit(state, {
      actorEmail: actor.email,
      actorName: actor.name,
      action: "service.source.saved",
      targetName: document.path,
      details: `Saved website source file ${document.path}. A local backup was created automatically before the write.`,
    });
    await saveStaffState(state);
    return NextResponse.json({ document, backupCreated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save website source file.";
    return jsonError(message, message.includes("changed on disk") ? 409 : 400);
  }
}
