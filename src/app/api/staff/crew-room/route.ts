import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-auth";
import { addAudit, getStaffState, hasPermission, saveStaffState } from "@/lib/staff-store";
import { CrewRoomExperienceError, getCrewRoomExperience, saveCrewRoomSettings } from "@/lib/crew-room-store";

async function authorize() {
  const session = await getStaffSession();
  if (!session) return { denied: NextResponse.json({ error: "Staff authentication required." }, { status: 401 }) };
  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!actor || !hasPermission(state, actor, "settings.edit")) {
    return { denied: NextResponse.json({ error: "Permission required: settings.edit." }, { status: 403 }) };
  }
  return { state, actor };
}

function errorResponse(error: unknown) {
  if (error instanceof CrewRoomExperienceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : "Crew Lounge settings are unavailable." }, { status: 503 });
}

export async function GET() {
  const auth = await authorize();
  if ("denied" in auth) return auth.denied;
  try {
    return NextResponse.json(await getCrewRoomExperience());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await authorize();
  if ("denied" in auth) return auth.denied;
  const body = await request.json().catch(() => null) as { settings?: Record<string, unknown> } | null;
  try {
    const settings = await saveCrewRoomSettings({
      featuredEventId: body?.settings?.featuredEventId,
      hostName: body?.settings?.hostName,
      hostMessage: body?.settings?.hostMessage,
      welcomePrompt: body?.settings?.welcomePrompt,
    });
    addAudit(auth.state, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "crew-room.settings.updated",
      details: settings.featuredEventId
        ? "Updated the Crew Lounge host note and featured BAV event table."
        : "Updated the Crew Lounge host note and cleared the featured event table.",
    });
    await saveStaffState(auth.state);
    return NextResponse.json({ settings });
  } catch (error) {
    return errorResponse(error);
  }
}
