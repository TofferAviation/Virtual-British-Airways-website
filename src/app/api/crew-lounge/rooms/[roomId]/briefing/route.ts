import { NextRequest, NextResponse } from "next/server";
import { getPilotSession } from "@/lib/pilot-auth";
import { VoiceRoomError, getVoiceRoomBriefing, publishPicActiveBooking } from "@/lib/voice-room-store";

function responseError(error: unknown) {
  if (error instanceof VoiceRoomError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: error instanceof Error ? error.message : "The shared briefing plan is unavailable." }, { status: 503 });
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await getPilotSession();
  if (!session) return NextResponse.json({ error: "Pilot authentication required." }, { status: 401 });
  try { return NextResponse.json({ briefing: await getVoiceRoomBriefing((await params).roomId) }); }
  catch (error) { return responseError(error); }
}

export async function POST(_: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const session = await getPilotSession();
  if (!session) return NextResponse.json({ error: "Pilot authentication required." }, { status: 401 });
  try { return NextResponse.json({ briefing: await publishPicActiveBooking((await params).roomId, session.pilotId) }); }
  catch (error) { return responseError(error); }
}
