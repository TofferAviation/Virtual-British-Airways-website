import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { transferCrewLinkControl } from "@/lib/crew-link-store";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { targetPilotId?: unknown } | null;
  if (typeof body?.targetPilotId !== "string" || !body.targetPilotId) return NextResponse.json({ error: "Choose an assigned CrewLink pilot." }, { status: 400 });
  try {
    const session = await transferCrewLinkControl({ sessionId: id, captainPilotId: auth.account.id, targetPilotId: body.targetPilotId });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CrewLink control could not be handed over." }, { status: 409 });
  }
}
