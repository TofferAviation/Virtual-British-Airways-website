import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { CrewRoomChatError, createCrewRoomMessage, listCrewRoomMessages } from "@/lib/crew-room-chat-store";

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof CrewRoomChatError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  try {
    const messages = await listCrewRoomMessages(
      url.searchParams.get("channel") ?? "crew-lounge",
      url.searchParams.get("limit"),
    );
    return NextResponse.json({ messages });
  } catch (error) {
    return errorResponse(error, "Crew Lounge is unavailable.");
  }
}

export async function POST(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as { channel?: unknown; body?: unknown } | null;
  try {
    const message = await createCrewRoomMessage({
      channel: body?.channel ?? "crew-lounge",
      body: body?.body,
      pilotId: auth.account.id,
      pilotNumber: auth.account.pilotNumber,
      pilotName: auth.account.name,
      pilotRank: auth.account.rank,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Crew Lounge could not send that message.");
  }
}
