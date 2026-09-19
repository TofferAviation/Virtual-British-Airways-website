"use server";

import { redirect } from "next/navigation";
import { configureFlightPlanSimbrief, getPilotBooking, getPilotFlightPlan, markFlightPlanDispatchOpened, updateFlightPlanFromSimbrief, updatePilotBookingAircraft } from "@/lib/pilot-operations-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { buildSimbriefDispatchUrl, fetchLatestSimbriefPlan, getSimbriefCodes } from "@/lib/simbrief";
import { getPilotById } from "@/lib/pilot-store";
import { getPilotAircraftEligibility } from "@/lib/pilot-ranks";
import { getManagedRoutes } from "@/lib/route-store";

function flightPlanPath(bookingId: string) {
  return `/flight-plans/${encodeURIComponent(bookingId)}`;
}

export async function changeBookingAircraft(formData: FormData) {
  const session = await requirePilotSession();
  const bookingId = String(formData.get("bookingId") ?? "");
  const requestedAircraft = String(formData.get("aircraft") ?? "").trim();
  const [booking, pilot, routes] = await Promise.all([
    getPilotBooking(bookingId, session.pilotId),
    getPilotById(session.pilotId),
    getManagedRoutes(),
  ]);
  if (!booking || !pilot || !requestedAircraft) redirect(`${flightPlanPath(bookingId)}?error=aircraft-change`);
  if (booking.status !== "booked") redirect(`${flightPlanPath(bookingId)}?error=aircraft-started`);

  const route = booking.routeId ? routes.find((item) => item.id === booking.routeId && item.active && !item.catalogueOnly) : null;
  const approvedAircraft = new Set(route ? [route.aircraft, ...(route.aircraftOptions ?? [])] : [booking.aircraft]);
  if (!approvedAircraft.has(requestedAircraft)) redirect(`${flightPlanPath(bookingId)}?error=aircraft-change`);

  const eligibility = getPilotAircraftEligibility({ rank: pilot.rank, typeRatings: pilot.typeRatings, aircraft: requestedAircraft });
  if (!eligibility.eligible) redirect(`${flightPlanPath(bookingId)}?error=aircraft-qualification`);

  await updatePilotBookingAircraft({ bookingId, pilotId: session.pilotId, aircraft: requestedAircraft });
  redirect(`${flightPlanPath(bookingId)}?aircraftUpdated=1`);
}

export async function openSimbriefDispatch(formData: FormData) {
  const session = await requirePilotSession();
  const bookingId = String(formData.get("bookingId") ?? "");
  const [booking, plan, pilot] = await Promise.all([getPilotBooking(bookingId, session.pilotId), getPilotFlightPlan(bookingId, session.pilotId), getPilotById(session.pilotId)]);
  if (!booking || !plan || !pilot?.simbriefPilotId) redirect(`${flightPlanPath(bookingId)}?error=simbrief-not-configured`);
  const dispatchUrl = buildSimbriefDispatchUrl(booking, pilot.name, pilot.simbriefPilotId);
  if (!dispatchUrl) redirect(`${flightPlanPath(bookingId)}?error=unsupported-simbrief-route`);
  await configureFlightPlanSimbrief({ bookingId, pilotId: session.pilotId, simbriefPilotId: pilot.simbriefPilotId, simbriefDispatchUrl: dispatchUrl });
  await markFlightPlanDispatchOpened(bookingId, session.pilotId);
  redirect(dispatchUrl);
}

export async function syncSimbriefFlightPlan(formData: FormData) {
  const session = await requirePilotSession();
  const bookingId = String(formData.get("bookingId") ?? "");
  const [booking, plan] = await Promise.all([getPilotBooking(bookingId, session.pilotId), getPilotFlightPlan(bookingId, session.pilotId)]);
  if (!booking || !plan?.simbriefPilotId) redirect(`${flightPlanPath(bookingId)}?error=simbrief-not-configured`);

  try {
    const details = await fetchLatestSimbriefPlan(plan.simbriefPilotId);
    const codes = getSimbriefCodes(booking);
    if (!details.origin || !details.destination || details.origin.toUpperCase() !== codes.origin || details.destination.toUpperCase() !== codes.destination) {
      throw new Error(`Your latest SimBrief plan does not match ${codes.origin ?? booking.from} → ${codes.destination ?? booking.to}. Generate this BAV flight first, then sync again.`);
    }
    await updateFlightPlanFromSimbrief({ bookingId, pilotId: session.pilotId, status: "synced", simbriefOfpId: details.ofpId, simbriefOfpUrl: details.ofpUrl, route: details.route, cruiseAltitude: details.cruiseAltitude, alternate: details.alternate, simbriefBriefing: details.briefing, generatedAt: details.generatedAt ?? new Date().toISOString() });
  } catch (error) {
    await updateFlightPlanFromSimbrief({ bookingId, pilotId: session.pilotId, status: "sync_failed" });
    const message = error instanceof Error ? error.message : "Unable to sync the SimBrief plan.";
    redirect(`${flightPlanPath(bookingId)}?error=${encodeURIComponent(message)}`);
  }
  // `redirect()` deliberately throws in Next.js. Keeping the successful
  // redirect outside the catch prevents it being reported as NEXT_REDIRECT.
  redirect(`${flightPlanPath(bookingId)}?synced=1`);
}
