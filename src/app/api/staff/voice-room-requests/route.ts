import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-auth";
import { addAudit, getStaffState, hasPermission, saveStaffState } from "@/lib/staff-store";
import { approveCrewRoomRequest, attachPublishedCrewRoomBriefing, CrewRoomRequestError, declineCrewRoomRequest, listCrewRoomRequestsForStaff } from "@/lib/crew-room-request-store";

export const dynamic = "force-dynamic";

async function authorize() {
  const session = await getStaffSession();
  if (!session) return { denied: NextResponse.json({ error: "Staff authentication required." }, { status: 401 }) } as const;
  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!actor || !hasPermission(state, actor, "settings.edit")) {
    return { denied: NextResponse.json({ error: "Permission required: settings.edit." }, { status: 403 }) } as const;
  }
  return { state, actor } as const;
}

function errorResponse(error: unknown) {
  if (error instanceof CrewRoomRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: error instanceof Error ? error.message : "The crew-room request could not be reviewed." }, { status: 503 });
}

export async function GET() {
  const auth = await authorize();
  if ("denied" in auth) return auth.denied;
  try {
    return NextResponse.json({ requests: await listCrewRoomRequestsForStaff() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authorize();
  if ("denied" in auth) return auth.denied;
  const body = await request.json().catch(() => null) as { action?: unknown; id?: unknown; capacity?: unknown; status?: unknown; staffNote?: unknown } | null;
  try {
    if (body?.action === "approve") {
      const result = await approveCrewRoomRequest({
        id: body.id,
        staffName: auth.actor.name,
        capacity: body.capacity,
        status: body.status,
        staffNote: body.staffNote,
      });
      addAudit(auth.state, {
        actorEmail: auth.actor.email,
        actorName: auth.actor.name,
        action: "crew-lounge.voice-room.request.approved",
        details: `Approved pilot crew-room request “${result.request.roomName}” as ${result.room.status} for ${result.room.maxParticipants} pilots.`,
      });
      await saveStaffState(auth.state);
      return NextResponse.json(result);
    }
    if (body?.action === "decline") {
      const crewRoomRequest = await declineCrewRoomRequest({ id: body.id, staffName: auth.actor.name, staffNote: body.staffNote });
      addAudit(auth.state, {
        actorEmail: auth.actor.email,
        actorName: auth.actor.name,
        action: "crew-lounge.voice-room.request.declined",
        details: `Declined pilot crew-room request “${crewRoomRequest.roomName}”.`,
      });
      await saveStaffState(auth.state);
      return NextResponse.json({ request: crewRoomRequest });
    }
    if (body?.action === "attach_briefing") {
      const crewRoomRequest = await attachPublishedCrewRoomBriefing(body.id);
      addAudit(auth.state, { actorEmail: auth.actor.email, actorName: auth.actor.name, action: "crew-lounge.voice-room.briefing.attached", details: `Attached the requested booking to “${crewRoomRequest.roomName}”.` });
      await saveStaffState(auth.state);
      return NextResponse.json({ request: crewRoomRequest });
    }
    return NextResponse.json({ error: "Choose whether to approve or decline this crew-room request." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
