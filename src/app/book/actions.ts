"use server";

import { redirect } from "next/navigation";
import { createPilotBooking } from "@/lib/pilot-operations-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getFlightsForRoute } from "@/lib/route-store";

export async function bookFlight(formData: FormData) {
  const session = await requirePilotSession();
  const from = String(formData.get("from") ?? "").toUpperCase();
  const to = String(formData.get("to") ?? "").toUpperCase();
  const date = String(formData.get("date") ?? "");
  const flightNumber = String(formData.get("flightNumber") ?? "");
  if (!from || !to || !date || !flightNumber) redirect("/book");

  const flights = await getFlightsForRoute(from, to);
  const flight = flights.find((item) => item.number === flightNumber);
  if (!flight) redirect(`/book?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${encodeURIComponent(date)}&error=unavailable`);

  await createPilotBooking({
    pilotId: session.pilotId,
    flightNumber: flight.number,
    from,
    to,
    aircraft: flight.aircraft,
    departure: flight.departure,
    arrival: flight.arrival,
    duration: flight.duration,
    date,
  });

  redirect("/account?booked=1");
}
