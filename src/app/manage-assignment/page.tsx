import { redirect } from "next/navigation";
import { getActivePilotBooking } from "@/lib/pilot-operations-store";
import { requirePilotSession } from "@/lib/pilot-auth";

export const dynamic = "force-dynamic";

export default async function ManageAssignmentPage() {
  const session = await requirePilotSession();
  const assignment = await getActivePilotBooking(session.pilotId);
  redirect(assignment ? `/flight-plans/${encodeURIComponent(assignment.id)}` : "/book");
}
