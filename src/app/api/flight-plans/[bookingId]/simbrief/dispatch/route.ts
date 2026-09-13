import { NextResponse } from "next/server";
import { configureFlightPlanSimbrief, getPilotBooking, getPilotFlightPlan, markFlightPlanDispatchOpened } from "@/lib/pilot-operations-store";
import { getPilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";
import { buildOfficialSimbriefDispatch, isSimbriefApiConfigured } from "@/lib/simbrief";

export const runtime = "nodejs";

function publicSiteUrl() {
  const value = process.env.BAV_PUBLIC_SITE_URL?.trim();
  if (!value) throw new Error("BAV_PUBLIC_SITE_URL must be configured before using SimBrief dispatch.");
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("BAV_PUBLIC_SITE_URL must use HTTP or HTTPS.");
  return url.origin;
}

export async function POST(_request: Request, context: { params: Promise<{ bookingId: string }> }) {
  if (!isSimbriefApiConfigured()) {
    return NextResponse.json({ error: "BAV Operations has not configured the SimBrief VA API key yet." }, { status: 503 });
  }

  const [{ bookingId }, session] = await Promise.all([context.params, getPilotSession()]);
  if (!session) return NextResponse.json({ error: "Sign in to your BAV account before starting SimBrief dispatch." }, { status: 401 });
  const [booking, plan, pilot] = await Promise.all([
    getPilotBooking(bookingId, session.pilotId),
    getPilotFlightPlan(bookingId, session.pilotId),
    getPilotById(session.pilotId),
  ]);
  if (!booking || !plan || !pilot?.simbriefPilotId) return NextResponse.json({ error: "Save your numeric SimBrief Pilot ID in Account Settings before generating this plan." }, { status: 400 });

  try {
    const callbackUrl = new URL(`/flight-plans/${encodeURIComponent(booking.id)}?simbrief=official`, publicSiteUrl()).toString();
    const dispatch = buildOfficialSimbriefDispatch({ booking, pilotName: pilot.name, simbriefPilotId: pilot.simbriefPilotId, callbackUrl });
    if (!dispatch) return NextResponse.json({ error: "This BAV service does not yet have the required SimBrief airport or aircraft mapping." }, { status: 422 });

    await configureFlightPlanSimbrief({ bookingId, pilotId: session.pilotId, simbriefPilotId: pilot.simbriefPilotId, simbriefDispatchUrl: dispatch.action });
    await markFlightPlanDispatchOpened(bookingId, session.pilotId);
    return NextResponse.json(dispatch, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start SimBrief dispatch." }, { status: 500 });
  }
}
