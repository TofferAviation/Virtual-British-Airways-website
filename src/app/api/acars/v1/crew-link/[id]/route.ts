import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { leaveCrewLinkSession } from "@/lib/crew-link-store";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    await leaveCrewLinkSession({ sessionId: id, pilotId: auth.account.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CrewLink could not be left." }, { status: 409 });
  }
}
