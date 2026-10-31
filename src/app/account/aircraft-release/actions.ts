"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePilotSession } from "@/lib/pilot-auth";
import { FleetServiceError, releaseOwnStaleFleetAssignment } from "@/lib/fleet-service";

export async function releaseStaleAircraft(form: FormData) {
  const pilot = await requirePilotSession();
  if (form.get("confirmed") !== "yes") redirect("/account/aircraft-release?error=Confirm that the flight has ended first.");
  try {
    await releaseOwnStaleFleetAssignment({ subject: `bav:${pilot.pilotId}`, displayName: pilot.name, fleetRole: "pilot" }, {
      aircraftId: String(form.get("aircraftId") ?? ""), assignmentId: String(form.get("assignmentId") ?? ""),
      reason: String(form.get("reason") ?? ""),
    });
  } catch (error) {
    if (!(error instanceof FleetServiceError)) throw error;
    redirect(`/account/aircraft-release?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/account"); revalidatePath("/fleet");
  redirect("/account/aircraft-release?released=1");
}
