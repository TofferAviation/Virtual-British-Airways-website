import { NextResponse } from "next/server";
import { requirePilotSession } from "@/lib/pilot-auth";
import { listPilotNotifications, markAllPilotNotificationsRead, markPilotNotificationRead, unreadPilotNotificationCount } from "@/lib/pilot-store";

export async function GET() {
  try {
    const session = await requirePilotSession();
    const [notifications, unreadCount] = await Promise.all([
      listPilotNotifications(session.pilotId),
      unreadPilotNotificationCount(session.pilotId),
    ]);
    return NextResponse.json({ notifications, unreadCount });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requirePilotSession();
    const body = await request.json().catch(() => null) as { id?: unknown; all?: unknown } | null;
    if (body?.all === true) {
      const updated = await markAllPilotNotificationsRead(session.pilotId);
      return NextResponse.json({ ok: true, updated });
    }
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id || id.length > 128) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    const updated = await markPilotNotificationRead(session.pilotId, id);
    return updated ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Notification not found." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
