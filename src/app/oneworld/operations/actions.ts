"use server";
import { redirect } from "next/navigation";
import { requirePilotSession } from "@/lib/pilot-auth";
import { bookAllianceFlight } from "@/lib/alliance-store";

export async function bookAlliance(form: FormData) {
  const session = await requirePilotSession();
  let id: string;
  try { id = await bookAllianceFlight(session.pilotId, String(form.get("scheduleId") ?? ""), String(form.get("date") ?? ""), { aircraft: String(form.get("aircraft") ?? ""), departure: String(form.get("departure") ?? "") }); }
  catch (error) { redirect(`/oneworld/operations?error=${encodeURIComponent(error instanceof Error ? error.message : "Booking could not be saved.")}`); }
  redirect(`/flight-plans/${encodeURIComponent(id)}`);
}
