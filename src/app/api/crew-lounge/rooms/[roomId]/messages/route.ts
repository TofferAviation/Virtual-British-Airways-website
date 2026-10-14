import { NextRequest, NextResponse } from "next/server";
import { CrewRoomChatError, createCrewRoomMessage, listCrewRoomMessagePortraits, listCrewRoomMessages } from "@/lib/crew-room-chat-store";
import { getPilotSession } from "@/lib/pilot-auth";
import { VoiceRoomError, getVoiceRoomById, voiceRoomChannel } from "@/lib/voice-room-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ roomId: string }> };

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof VoiceRoomError || error instanceof CrewRoomChatError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 503 },
  );
}

async function getOpenRoom(roomId: string) {
  const room = await getVoiceRoomById(roomId, { includeClosed: true });
  if (room.status !== "open") {
    throw new VoiceRoomError("This crew room is not open for conversation yet.", 403);
  }
  return room;
}

async function getAuthenticatedRoom(context: Context) {
  const pilot = await getPilotSession();
  if (!pilot) return { denied: NextResponse.json({ error: "Pilot sign-in required." }, { status: 401 }) } as const;
  const { roomId } = await context.params;
  return { pilot, room: await getOpenRoom(roomId) } as const;
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const auth = await getAuthenticatedRoom(context);
    if ("denied" in auth) return auth.denied;
    const limit = new URL(request.url).searchParams.get("limit");
    const messages = await listCrewRoomMessages(voiceRoomChannel(auth.room.id), limit);
    const portraits = await listCrewRoomMessagePortraits(messages);
    return NextResponse.json(
      { messages, portraits },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "Crew conversation is unavailable.");
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const auth = await getAuthenticatedRoom(context);
    if ("denied" in auth) return auth.denied;
    const body = await request.json().catch(() => null) as { body?: unknown } | null;
    const message = await createCrewRoomMessage({
      channel: voiceRoomChannel(auth.room.id),
      body: body?.body,
      pilotId: auth.pilot.pilotId,
      pilotNumber: auth.pilot.pilotNumber,
      pilotName: auth.pilot.name,
      pilotRank: null,
    });
    return NextResponse.json({ message }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error, "Crew conversation could not send that message.");
  }
}
