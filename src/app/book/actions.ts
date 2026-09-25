"use server";

import { redirect } from "next/navigation";
import { ActivePilotBookingError, clearPilotBookingFleetSelection, createFlightPlanForBooking, createPilotBooking, getActivePilotBooking } from "@/lib/pilot-operations-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";
import { getPilotAircraftEligibility } from "@/lib/pilot-ranks";
import { getFlightsForRoute } from "@/lib/route-store";
import { buildSimbriefDispatchUrl } from "@/lib/simbrief";
import { ensureFleetMembership, fleetAircraftMatchesVirtualType, FleetServiceError, isFleetAircraftBookable, listFleetAircraft, reserveFleetAircraftForFlight } from "@/lib/fleet-service";

export async function bookFlight(formData: FormData) {
  const session = await requirePilotSession();
  const from = String(formData.get("from") ?? "").toUpperCase();
  const to = String(formData.get("to") ?? "").toUpperCase();
  const date = String(formData.get("date") ?? "");
  const flightNumber = String(formData.get("flightNumber") ?? "");
  const routeId = String(formData.get("routeId") ?? "");
  const requestedAircraft = String(formData.get("aircraft") ?? "").trim();
  const requestedFleetAircraftId = String(formData.get("fleetAircraftId") ?? "").trim();
  const flexible = String(formData.get("flexible") ?? "") === "1";
  if (!from || !to || !date || !flightNumber || !routeId) redirect("/book");

  const flights = await getFlightsForRoute(from, to, date, { includeVirtualFlexible: flexible });
  const flight = flights.find((item) => item.routeId === routeId && item.number === flightNumber);
  if (!flight || flight.slots <= 0) redirect(`/book?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}&error=unavailable`);

  const pilot = await getPilotById(session.pilotId);
  if (!pilot) redirect("/login");
  const approvedAircraft = new Set([flight.aircraft, ...(flight.aircraftOptions ?? [])]);
  const selectedAircraft = requestedAircraft || flight.aircraft;
  if (!approvedAircraft.has(selectedAircraft)) {
    redirect(`/book?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}&error=aircraft`);
  }
  const eligibility = getPilotAircraftEligibility({ rank: pilot.rank, typeRatings: pilot.typeRatings, aircraft: selectedAircraft });
  if (!eligibility.eligible) {
    redirect(`/book?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}&error=qualification`);
  }

  let selectedFleetAircraft: Awaited<ReturnType<typeof listFleetAircraft>>[number] | null = null;
  if (requestedFleetAircraftId) {
    try {
      selectedFleetAircraft = (await listFleetAircraft()).find((aircraft) => aircraft.id === requestedFleetAircraftId) ?? null;
    } catch (error) {
      if (error instanceof FleetServiceError) {
        redirect(`/book?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}&error=fleet`);
      }
      throw error;
    }

    if (!selectedFleetAircraft ||
        !fleetAircraftMatchesVirtualType(selectedFleetAircraft, selectedAircraft) ||
        !isFleetAircraftBookable(selectedFleetAircraft)) {
      redirect(`/book?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}&error=registration`);
    }
  }

  // A double-click, stale page, or a second browser must not be able to
  // replace the pilot's live Ember assignment. Send them back to the existing
  // briefing instead; an explicit future cancellation flow is required to
  // change it.
  const activeBooking = await getActivePilotBooking(session.pilotId);
  if (activeBooking) {
    redirect(`/flight-plans/${encodeURIComponent(activeBooking.id)}?protected=1`);
  }

  let booking;
  try {
    booking = await createPilotBooking({
      pilotId: session.pilotId,
      routeId: flight.routeId,
      flightNumber: flight.number,
      from,
      to,
      aircraft: selectedAircraft,
      fleetAircraftId: selectedFleetAircraft?.id ?? null,
      registration: selectedFleetAircraft?.registration ?? null,
      departure: flight.departure,
      arrival: flight.arrival,
      duration: flight.duration,
      date,
      scheduleScoringEnabled: flight.scheduleScoringEnabled === true,
    });
  } catch (error) {
    // Covers two submissions racing each other between the check above and
    // the write. The existing assignment remains untouched.
    if (error instanceof ActivePilotBookingError) {
      redirect(`/flight-plans/${encodeURIComponent(error.booking.id)}?protected=1`);
    }
    throw error;
  }

  const simbriefPilotId = pilot?.simbriefPilotId ?? null;
  await createFlightPlanForBooking({
    bookingId: booking.id,
    pilotId: session.pilotId,
    simbriefPilotId,
    simbriefDispatchUrl: simbriefPilotId && pilot ? buildSimbriefDispatchUrl(booking, pilot.name, simbriefPilotId) : null,
  });

  if (selectedFleetAircraft) {
    try {
      const actor = { subject: `bav:${session.pilotId}`, displayName: pilot.name, fleetRole: "pilot" };
      await ensureFleetMembership({ subject: actor.subject, displayName: actor.displayName, websiteRole: "pilot" });
      await reserveFleetAircraftForFlight(selectedFleetAircraft.id, actor, {
        pilotSubject: actor.subject,
        pilotDisplayName: actor.displayName,
        flightReference: booking.flightNumber,
        departureStation: booking.from,
        arrivalStation: booking.to,
      });
    } catch (error) {
      // Fleet performs the final concurrent availability check. Keep the
      // protected BAV booking, but do not claim a registration that was taken
      // between the page load and this reservation request.
      await clearPilotBookingFleetSelection({ bookingId: booking.id, pilotId: session.pilotId });
      if (error instanceof FleetServiceError) {
        redirect(`/flight-plans/${encodeURIComponent(booking.id)}?error=registration-unavailable`);
      }
      throw error;
    }
  }

  redirect(`/flight-plans/${booking.id}`);
}
