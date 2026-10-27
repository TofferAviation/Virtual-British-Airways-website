import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { completeAcarsSession, getAcarsSession } from "@/lib/acars-store";
import { submitAcarsPirep } from "@/lib/acars-pirep";
import { getPirepForAcarsSession } from "@/lib/pilot-operations-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await getAcarsSession(id);
  if (!existing || existing.pilotId !== auth.account.id) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { landingFpm?: number | null; pilotComments?: string; simulatorBlockMinutes?: number | null };
  const session = existing.status === "active"
    ? await completeAcarsSession(id, auth.account.id, typeof body.landingFpm === "number" ? body.landingFpm : null)
    : existing.status === "completed" ? existing : null;
  if (!session?.completedAt) return NextResponse.json({ error: "Session is not active." }, { status: 409 });
  const alreadySubmitted = await getPirepForAcarsSession(session.id);
  if (alreadySubmitted) return NextResponse.json({ session, pirep: alreadySubmitted, arrival: null, fleet: null });
  const { pirep, arrival, fleet } = await submitAcarsPirep(session, body);

  return NextResponse.json({ session, pirep, arrival, fleet });
}
