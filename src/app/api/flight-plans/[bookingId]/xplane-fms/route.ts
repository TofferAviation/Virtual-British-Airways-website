import { NextResponse } from "next/server";
import { getPilotBooking, getPilotFlightPlan } from "@/lib/pilot-operations-store";
import { getPilotSession } from "@/lib/pilot-auth";
import { getSimbriefCodes } from "@/lib/simbrief";
import { buildXPlaneFmsPlan, xplaneFmsFilename } from "@/lib/xplane-fms";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ bookingId: string }> }) {
  const [{ bookingId }, session] = await Promise.all([context.params, getPilotSession()]);
  if (!session) return NextResponse.json({ error: "Sign in to download your X-Plane flight plan." }, { status: 401 });
  const [booking, plan] = await Promise.all([
    getPilotBooking(bookingId, session.pilotId),
    getPilotFlightPlan(bookingId, session.pilotId),
  ]);
  if (!booking || plan?.status !== "synced" || !plan.simbriefBriefing) {
    return NextResponse.json({ error: "Sync the matching SimBrief OFP before downloading an X-Plane flight plan." }, { status: 409 });
  }

  try {
    const airportCodes = getSimbriefCodes(booking);
    return new NextResponse(buildXPlaneFmsPlan(booking, plan.simbriefBriefing, airportCodes), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${xplaneFmsFilename(booking, airportCodes)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to build the X-Plane flight plan." }, { status: 422 });
  }
}
