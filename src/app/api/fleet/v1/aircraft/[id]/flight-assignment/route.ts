import { NextRequest, NextResponse } from "next/server";
import { requireFleetPilot, requireFleetPilotAircraftForActiveBooking } from "@/lib/fleet-pilot-auth";
import { cancelFleetAircraftReservation, FleetServiceError, reserveFleetAircraftForFlight, type FleetFlightAssignmentInput } from "@/lib/fleet-service";
import { clearPilotBookingFleetSelection, getActivePilotBooking } from "@/lib/pilot-operations-store";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requireFleetPilot(request);
    const body = await request.json() as { assignment?: FleetFlightAssignmentInput };
    if (!body.assignment || typeof body.assignment !== "object") throw new FleetServiceError("A flight assignment is required.", 400);
    const { id } = await context.params;
    await requireFleetPilotAircraftForActiveBooking(actor, id);
    const assignment = await reserveFleetAircraftForFlight(id, actor, { ...body.assignment, pilotSubject: actor.subject, pilotDisplayName: actor.displayName });
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not reserve aircraft." }, { status: known ? error.status : 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requireFleetPilot(request);
    const body = await request.json() as { assignment?: FleetFlightAssignmentInput };
    if (!body.assignment || typeof body.assignment !== "object") throw new FleetServiceError("A flight assignment is required.", 400);
    const { id } = await context.params;
    const assignment = await cancelFleetAircraftReservation(id, actor, { ...body.assignment, pilotSubject: actor.subject, pilotDisplayName: actor.displayName });
    // A registration selected at booking time is retained by the protected
    // BAV booking. Clear that selection after a successful pre-flight release
    // so Ember does not keep the pilot tied to an aircraft that is available
    // again. A cancellation never changes the flight itself: it simply returns
    // the booking to "any available registration".
    let bookingRegistrationCleared = false;
    try {
      const booking = await getActivePilotBooking(actor.pilotId);
      if (booking?.status === "booked" && booking.fleetAircraftId === id) {
        await clearPilotBookingFleetSelection({ bookingId: booking.id, pilotId: actor.pilotId });
        bookingRegistrationCleared = true;
      }
    } catch (error) {
      // The aircraft release has already succeeded. Do not report a failure to
      // Ember just because the presentation-layer selection could not be
      // cleared; it can be reconciled on the next booking refresh.
      console.error("[fleet] Could not clear released booking registration", error);
    }
    return NextResponse.json({ assignment, bookingRegistrationCleared });
  } catch (error) {
    const known = error instanceof FleetServiceError;
    return NextResponse.json({ error: known ? error.message : "Could not release aircraft reservation." }, { status: known ? error.status : 500 });
  }
}
