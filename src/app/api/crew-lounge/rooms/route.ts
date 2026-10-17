import { NextResponse } from "next/server";
import { getPilotSession } from "@/lib/pilot-auth";
import { listVoiceRooms } from "@/lib/voice-room-store";

export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** The live Lounge board exposes no staff keys or private room metadata. */
export async function GET() {
  const pilot = await getPilotSession();
  if (!pilot) return response({ error: "Pilot sign-in required." }, 401);

  return response({
    rooms: (await listVoiceRooms()).map((room) => ({
      id: room.id,
      name: room.name,
      description: room.description,
      startsAt: room.startsAt,
      endsAt: room.endsAt,
      status: room.status,
      maxParticipants: room.maxParticipants,
      bannerId: room.bannerId,
      hasCustomBanner: room.hasCustomBanner,
    })),
  });
}
