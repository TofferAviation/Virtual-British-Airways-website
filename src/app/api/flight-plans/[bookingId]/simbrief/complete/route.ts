import { NextResponse } from "next/server";
import { getPilotBooking, getPilotFlightPlan, updateFlightPlanFromSimbrief } from "@/lib/pilot-operations-store";
import { getPilotSession } from "@/lib/pilot-auth";
import { fetchLatestSimbriefPlan, getSimbriefCodes } from "@/lib/simbrief";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ bookingId: string }> }) {
  const body = await request.json().catch(() => null) as { ofpId?: string } | null;
  const expectedOfpId = body?.ofpId?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(expectedOfpId)) return NextResponse.json({ error: "Invalid SimBrief flight-plan reference." }, { status: 400 });

  const [{ bookingId }, session] = await Promise.all([context.params, getPilotSession()]);
  if (!session) return NextResponse.json({ error: "Sign in to your BAV account before saving a SimBrief OFP." }, { status: 401 });
  const [booking, plan] = await Promise.all([getPilotBooking(bookingId, session.pilotId), getPilotFlightPlan(bookingId, session.pilotId)]);
  if (!booking || !plan?.simbriefPilotId) return NextResponse.json({ error: "This BAV flight does not have a configured SimBrief Pilot ID." }, { status: 400 });

  try {
    const details = await fetchLatestSimbriefPlan(plan.simbriefPilotId);
    if (!details.ofpId || details.ofpId.toUpperCase() !== expectedOfpId.toUpperCase()) {
      return NextResponse.json({ error: "SimBrief is still publishing this OFP. Keep the dispatch popup open until it finishes, then try again." }, { status: 409 });
    }
    const codes = getSimbriefCodes(booking);
    if (!details.origin || !details.destination || details.origin.toUpperCase() !== codes.origin || details.destination.toUpperCase() !== codes.destination) {
      return NextResponse.json({ error: `The generated OFP does not match ${codes.origin ?? booking.from} → ${codes.destination ?? booking.to}.` }, { status: 422 });
    }

    const flightPlan = await updateFlightPlanFromSimbrief({
      bookingId,
      pilotId: session.pilotId,
      status: "synced",
      simbriefOfpId: details.ofpId,
      simbriefOfpUrl: details.ofpUrl,
      route: details.route,
      cruiseAltitude: details.cruiseAltitude,
      alternate: details.alternate,
      simbriefBriefing: details.briefing,
      generatedAt: details.generatedAt ?? new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, flightPlan }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to retrieve the generated SimBrief OFP." }, { status: 502 });
  }
}
