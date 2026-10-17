import { NextResponse } from "next/server";
import { getPilotSession } from "@/lib/pilot-auth";
import { VoiceRoomError, readVoiceRoomCustomBanner } from "@/lib/voice-room-store";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ roomId: string }> };

export async function GET(_: Request, context: Context) {
  const pilot = await getPilotSession();
  if (!pilot) return NextResponse.json({ error: "Pilot sign-in required." }, { status: 401 });
  try {
    const { roomId } = await context.params;
    const image = await readVoiceRoomCustomBanner(roomId);
    if (!image) return NextResponse.json({ error: "This crew room uses a BAV banner instead." }, { status: 404 });
    return new NextResponse(image.bytes, { headers: { "Content-Type": image.contentType, "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    const status = error instanceof VoiceRoomError ? error.status : 503;
    return NextResponse.json({ error: error instanceof Error ? error.message : "The room banner is unavailable." }, { status });
  }
}
