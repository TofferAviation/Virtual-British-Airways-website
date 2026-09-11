"use server";

import { redirect } from "next/navigation";
import { configureFlightPlanSimbrief, getPilotBooking, getPilotFlightPlan, markFlightPlanDispatchOpened, updateFlightPlanFromSimbrief } from "@/lib/pilot-operations-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { buildSimbriefDispatchUrl, extractSimbriefPlan, getSimbriefCodes } from "@/lib/simbrief";
import { getPilotById } from "@/lib/pilot-store";

function flightPlanPath(bookingId: string) {
  return `/flight-plans/${encodeURIComponent(bookingId)}`;
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
    const response = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?userid=${encodeURIComponent(plan.simbriefPilotId)}&json=1`, { cache: "no-store" });
    if (!response.ok) throw new Error("SimBrief could not find a generated flight plan for this Pilot ID yet.");
    const data = await response.json() as Record<string, unknown>;
    const details = extractSimbriefPlan(data);
    const codes = getSimbriefCodes(booking);
    if (!details.origin || !details.destination || details.origin.toUpperCase() !== codes.origin || details.destination.toUpperCase() !== codes.destination) {
      throw new Error(`Your latest SimBrief plan does not match ${codes.origin ?? booking.from} → ${codes.destination ?? booking.to}. Generate this BAV flight first, then sync again.`);
    }
    await updateFlightPlanFromSimbrief({ bookingId, pilotId: session.pilotId, status: "synced", simbriefOfpId: details.ofpId, simbriefOfpUrl: details.ofpUrl, route: details.route, cruiseAltitude: details.cruiseAltitude, alternate: details.alternate, generatedAt: details.generatedAt ?? new Date().toISOString() });
    redirect(`${flightPlanPath(bookingId)}?synced=1`);
  } catch (error) {
    await updateFlightPlanFromSimbrief({ bookingId, pilotId: session.pilotId, status: "sync_failed" });
    const message = error instanceof Error ? error.message : "Unable to sync the SimBrief plan.";
    redirect(`${flightPlanPath(bookingId)}?error=${encodeURIComponent(message)}`);
  }
}
