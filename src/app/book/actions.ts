"use server";

import { redirect } from "next/navigation";
import { createFlightPlanForBooking, createPilotBooking } from "@/lib/pilot-operations-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";
import { getPilotAircraftEligibility } from "@/lib/pilot-ranks";
import { getFlightsForRoute } from "@/lib/route-store";
import { buildSimbriefDispatchUrl } from "@/lib/simbrief";

export async function bookFlight(formData: FormData) {
  const session = await requirePilotSession();
  const from = String(formData.get("from") ?? "").toUpperCase();
  const to = String(formData.get("to") ?? "").toUpperCase();
  const date = String(formData.get("date") ?? "");
  const flightNumber = String(formData.get("flightNumber") ?? "");
  const routeId = String(formData.get("routeId") ?? "");
  const requestedAircraft = String(formData.get("aircraft") ?? "").trim();
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

  const booking = await createPilotBooking({
    pilotId: session.pilotId,
    routeId: flight.routeId,
    flightNumber: flight.number,
    from,
    to,
    aircraft: selectedAircraft,
    departure: flight.departure,
    arrival: flight.arrival,
    duration: flight.duration,
    date,
  });

  const simbriefPilotId = pilot?.simbriefPilotId ?? null;
  await createFlightPlanForBooking({
    bookingId: booking.id,
    pilotId: session.pilotId,
    simbriefPilotId,
    simbriefDispatchUrl: simbriefPilotId && pilot ? buildSimbriefDispatchUrl(booking, pilot.name, simbriefPilotId) : null,
  });

  redirect(`/flight-plans/${booking.id}`);
}
