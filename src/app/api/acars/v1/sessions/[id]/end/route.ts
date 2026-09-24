import { NextResponse } from "next/server";
import { arrivalResolutionNote, resolveAcarsArrival } from "@/lib/acars-arrival";
import { reconcileFleetArrival } from "@/lib/acars-fleet-reconciliation";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { completeAcarsSession, getAcarsSession } from "@/lib/acars-store";
import { recordPilotPirep } from "@/lib/pilot-operations-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await getAcarsSession(id);
  if (!existing || existing.pilotId !== auth.account.id) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { landingFpm?: number | null; pilotComments?: string };
  const arrival = await resolveAcarsArrival(existing);
  const session = await completeAcarsSession(id, auth.account.id, typeof body.landingFpm === "number" ? body.landingFpm : null);
  if (!session?.completedAt) return NextResponse.json({ error: "Session is not active." }, { status: 409 });

  const blockMinutes = Math.max(1, Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60000));
  const fuelUsedKg = session.firstFuelKg != null && session.lastFuelKg != null ? Math.max(0, Math.round(session.firstFuelKg - session.lastFuelKg)) : null;
  const fleet = await reconcileFleetArrival(session, arrival);
  const pilotComments = (body.pilotComments ?? "").trim().slice(0, 2000);
  const arrivalNote = arrivalResolutionNote(arrival);
  const comments = [arrivalNote, pilotComments ? arrivalNote ? `Pilot note: ${pilotComments}` : pilotComments : ""].filter(Boolean).join("\n\n").slice(0, 2000);
  const pirep = await recordPilotPirep({
    pilotId: session.pilotId,
    bookingId: session.bookingId,
    flightNumber: session.flightNumber,
    from: session.from,
    // The PIREP route represents where the simulator actually finished when
    // that station is verified. An unknown arrival deliberately remains
    // planned until staff can review its ACARS reconciliation note.
    to: arrival.actualStation ?? session.to,
    aircraft: session.aircraft,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    blockMinutes,
    distanceNm: Math.max(0, Math.round(session.distanceNm)),
    landingFpm: session.landingFpm,
    fuelUsedKg,
    status: "pending",
    source: "acars",
    simulator: session.simulator,
    acarsSessionId: session.id,
    pilotComments: comments,
  });

  return NextResponse.json({ session, pirep, arrival, fleet });
}
