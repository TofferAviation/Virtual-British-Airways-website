import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { getAcarsSession } from "@/lib/acars-store";
import { getPirepForAcarsSession } from "@/lib/pilot-operations-store";

/** Returns only the signed-in pilot's session, so Ember can safely resume a local recovery manifest. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const session = await getAcarsSession(id);
  if (!session || session.pilotId !== auth.account.id) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  return NextResponse.json({ session, pirep: await getPirepForAcarsSession(session.id) });
}
