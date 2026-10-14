import { NextRequest, NextResponse } from "next/server";
import { getPilotSession } from "@/lib/pilot-auth";
import { VoiceRoomError, getVoiceRoomById } from "@/lib/voice-room-store";
import {
  VoicePeerError,
  joinVoicePeerRoom,
  leaveVoicePeerRoom,
  pollVoicePeerRoom,
  previewVoicePeerRoom,
  sendVoicePeerSignal,
  voicePeerIceServers,
} from "@/lib/voice-room-p2p-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ roomId: string }> };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function errorResponse(error: unknown) {
  if (error instanceof VoiceRoomError || error instanceof VoicePeerError) return response({ error: error.message }, error.status);
  return response({ error: error instanceof Error ? error.message : "The private call layer is unavailable." }, 503);
}

async function authenticate(context: Context) {
  const pilot = await getPilotSession();
  if (!pilot) return { denied: response({ error: "Pilot sign-in required." }, 401) } as const;
  const { roomId } = await context.params;
  const room = await getVoiceRoomById(roomId, { includeClosed: true });
  if (room.status !== "open") throw new VoiceRoomError("This crew room is not open for voice yet.", 403);
  return { pilot, room } as const;
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const auth = await authenticate(context);
    if ("denied" in auth) return auth.denied;
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.action !== "string") return response({ error: "Choose a voice action." }, 400);

    if (body.action === "preview") {
      return response(previewVoicePeerRoom(auth.room.id));
    }
    if (body.action === "join") {
      const joined = joinVoicePeerRoom({
        roomId: auth.room.id,
        pilotId: auth.pilot.pilotId,
        pilotNumber: auth.pilot.pilotNumber,
        name: auth.pilot.name,
        profileImage: auth.pilot.profileImage,
      });
      return response({ ...joined, iceServers: await voicePeerIceServers() });
    }
    if (body.action === "poll") {
      return response(pollVoicePeerRoom({ roomId: auth.room.id, pilotId: auth.pilot.pilotId, sessionId: body.sessionId, token: body.token }));
    }
    if (body.action === "signal") {
      return response(sendVoicePeerSignal({
        roomId: auth.room.id,
        pilotId: auth.pilot.pilotId,
        sessionId: body.sessionId,
        token: body.token,
        targetSessionId: body.targetSessionId,
        kind: body.kind,
        payload: body.payload,
      }));
    }
    if (body.action === "leave") {
      leaveVoicePeerRoom({ roomId: auth.room.id, pilotId: auth.pilot.pilotId, sessionId: body.sessionId, token: body.token });
      return response({ ok: true });
    }
    return response({ error: "That voice action is not available." }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
