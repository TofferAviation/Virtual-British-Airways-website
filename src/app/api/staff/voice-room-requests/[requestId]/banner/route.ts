import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-auth";
import { getStaffState, hasPermission } from "@/lib/staff-store";
import { CrewRoomRequestError, readCrewRoomRequestBanner } from "@/lib/crew-room-request-store";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ requestId: string }> };

export async function GET(_: Request, context: Context) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "Staff authentication required." }, { status: 401 });
  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!actor || !hasPermission(state, actor, "settings.edit")) return NextResponse.json({ error: "Permission required: settings.edit." }, { status: 403 });
  try {
    const { requestId } = await context.params;
    const image = await readCrewRoomRequestBanner(requestId);
    if (!image) return NextResponse.json({ error: "This request uses a BAV banner instead." }, { status: 404 });
    return new NextResponse(image.bytes, { headers: { "Content-Type": image.contentType, "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    const status = error instanceof CrewRoomRequestError ? error.status : 503;
    return NextResponse.json({ error: error instanceof Error ? error.message : "The custom banner is unavailable." }, { status });
  }
}
