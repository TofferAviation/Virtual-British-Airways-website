import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { listPilotNotifications, markAllPilotNotificationsRead, markPilotNotificationRead, unreadPilotNotificationCount } from "@/lib/pilot-store";

export async function GET(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [notifications, unreadCount] = await Promise.all([
    listPilotNotifications(auth.account.id),
    unreadPilotNotificationCount(auth.account.id),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { id?: unknown; all?: unknown } | null;
  if (body?.all === true) {
    const updated = await markAllPilotNotificationsRead(auth.account.id);
    return NextResponse.json({ ok: true, updated });
  }
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id || id.length > 128) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  const updated = await markPilotNotificationRead(auth.account.id, id);
  return updated ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Notification not found." }, { status: 404 });
}
