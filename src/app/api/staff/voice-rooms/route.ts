import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-auth";
import { addAudit, getStaffState, hasPermission, saveStaffState } from "@/lib/staff-store";
import { VoiceRoomError, createVoiceRoom, listVoiceRooms, updateVoiceRoomStatus } from "@/lib/voice-room-store";

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
  if (error instanceof VoiceRoomError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: error instanceof Error ? error.message : "Voice rooms are unavailable." }, { status: 503 });
}

export async function GET() {
  const auth = await authorize();
  if ("denied" in auth) return auth.denied;
  try {
    return NextResponse.json({ rooms: await listVoiceRooms({ includeClosed: true }) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorize();
  if ("denied" in auth) return auth.denied;
  const body = await request.json().catch(() => null) as { room?: Record<string, unknown> } | null;
  try {
    const room = await createVoiceRoom({
      name: body?.room?.name,
      slug: body?.room?.slug,
      description: body?.room?.description,
      eventId: body?.room?.eventId,
      startsAt: body?.room?.startsAt,
      endsAt: body?.room?.endsAt,
      status: body?.room?.status,
    });
    addAudit(auth.state, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "crew-lounge.voice-room.created",
      details: `Created ${room.status} voice room “${room.name}”.`,
    });
    await saveStaffState(auth.state);
    return NextResponse.json({ room }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authorize();
  if ("denied" in auth) return auth.denied;
  const body = await request.json().catch(() => null) as { id?: unknown; status?: unknown } | null;
  try {
    const room = await updateVoiceRoomStatus({ id: body?.id, status: body?.status });
    addAudit(auth.state, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "crew-lounge.voice-room.status.updated",
      details: `Changed voice room “${room.name}” to ${room.status}.`,
    });
    await saveStaffState(auth.state);
    return NextResponse.json({ room });
  } catch (error) {
    return errorResponse(error);
  }
}
