import { NextRequest, NextResponse } from "next/server";
import { getAcarsSession } from "@/lib/acars-store";
import { parsePirepArrivalReconciliation } from "@/lib/acars-arrival";
import { isCareerFeatureEnabled } from "@/lib/career-experience";
import { FleetServiceError, getFleetAircraft, getFleetAircraftRecord, getFleetFlightAssignmentForPilotAndFlight, listFleetAircraft, reportFleetDefect } from "@/lib/fleet-service";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotBooking, getPirep } from "@/lib/pilot-operations-store";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set(["Aircraft systems", "Flight deck", "Cabin", "Ground equipment", "Other"]);

export async function POST(request: NextRequest) {
  try {
    if (!isCareerFeatureEnabled("fleet")) return NextResponse.json({ ok: false, error: "Fleet reporting is not enabled." }, { status: 404 });
    const session = await requirePilotSession();
    const body = await request.json() as { pirepId?: unknown; category?: unknown; description?: unknown };
    const pirepId = typeof body.pirepId === "string" ? body.pirepId.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim().replace(/\s+/g, " ") : "";
    if (!/^[0-9a-f-]{20,80}$/i.test(pirepId)) throw new FleetServiceError("The flight report reference is invalid.", 400);
    if (!CATEGORIES.has(category)) throw new FleetServiceError("Choose a technical report category.", 400);
    if (description.length < 8 || description.length > 1000) throw new FleetServiceError("Describe the observation in 8 to 1,000 characters.", 400);

    const pirep = await getPirep(pirepId);
    if (!pirep || pirep.pilotId !== session.pilotId || pirep.source !== "acars" || !pirep.acarsSessionId) throw new FleetServiceError("This report is not eligible for a Fleet technical observation.", 404);
    const acars = await getAcarsSession(pirep.acarsSessionId);
    if (!acars || acars.pilotId !== session.pilotId || acars.status !== "completed") throw new FleetServiceError("The linked Ember flight could not be verified.", 409);
    const registration = acars.lastSnapshot?.registration?.trim().toUpperCase() ?? "";
    if (!registration) throw new FleetServiceError("Ember did not record a registration for this flight.", 409);

    const booking = pirep.bookingId ? await getPilotBooking(pirep.bookingId, session.pilotId) : null;
    const bookedAircraft = booking?.fleetAircraftId && booking.registration === registration ? await getFleetAircraft(booking.fleetAircraftId) : null;
    const aircraft = bookedAircraft ?? (await listFleetAircraft()).find((candidate) => candidate.registration === registration) ?? null;
    if (!aircraft || aircraft.registration !== registration) throw new FleetServiceError("This flight is not linked to a Fleet registration that can receive a technical report.", 409);

    const assignment = await getFleetFlightAssignmentForPilotAndFlight({ pilotSubject: `bav:${session.pilotId}`, aircraftId: aircraft.id, flightReference: pirep.flightNumber });
    if (!assignment) throw new FleetServiceError("The completed Fleet assignment for this flight could not be verified.", 409);
    const record = await getFleetAircraftRecord(aircraft.id);
    const marker = `[BAV PIREP:${pirep.id}]`;
    if (record?.defects.some((defect) => defect.description.includes(marker))) throw new FleetServiceError("A technical report has already been submitted for this flight.", 409);

    const arrival = parsePirepArrivalReconciliation(pirep.pilotComments);
    const defect = await reportFleetDefect(aircraft.id, { subject: `bav:${session.pilotId}`, displayName: acars.pilotName, fleetRole: "pilot" }, {
      category,
      description: `${marker} ${description}`,
      severity: "normal",
      dispatchImpact: "none",
      station: arrival?.actualStation ?? pirep.to,
      source: "flight_crew",
    });
    return NextResponse.json({ ok: true, reference: defect.reference }, { status: 201 });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ ok: false, error: known ? error.message : "Unable to submit the technical report." }, { status: known ? error.status : 500 });
  }
}
