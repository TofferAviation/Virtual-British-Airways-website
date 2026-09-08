import { NextRequest, NextResponse } from "next/server";
import { getNewsPageSettings, normalizeNewsPageSettings, saveNewsPageSettings } from "@/lib/news-page-store";
import { getStaffSession } from "@/lib/staff-auth";
import { addAudit, getStaffState, hasPermission, saveStaffState } from "@/lib/staff-store";

async function authorize(edit = false) {
  const session = await getStaffSession();
  if (!session) return { denied: NextResponse.json({ error: "Staff authentication required." }, { status: 401 }) };
  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  const permission = edit ? "news.edit" : "news.view";
  if (!actor || !hasPermission(state, actor, permission)) {
    return { denied: NextResponse.json({ error: `Permission required: ${permission}.` }, { status: 403 }) };
  }
  return { session, state, actor };
}

export async function GET() {
  const auth = await authorize(false);
  if ("denied" in auth) return auth.denied;
  return NextResponse.json({ settings: await getNewsPageSettings() });
}

export async function PUT(request: NextRequest) {
  const auth = await authorize(true);
  if ("denied" in auth) return auth.denied;
  try {
    const body = await request.json() as { settings?: unknown };
    if (!body.settings || typeof body.settings !== "object") throw new Error("Invalid newsroom page settings.");
    const settings = await saveNewsPageSettings(normalizeNewsPageSettings(body.settings));
    addAudit(auth.state, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "news.page.updated",
      details: "Updated the public News & Announcements page layout and presentation settings.",
    });
    await saveStaffState(auth.state);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save newsroom page settings." }, { status: 400 });
  }
}
