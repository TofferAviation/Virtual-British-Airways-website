"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { submitAcarsPirep } from "@/lib/acars-pirep";
import { getAcarsSession, recoverAcarsSession } from "@/lib/acars-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getPirepForAcarsSession } from "@/lib/pilot-operations-store";

export async function recoverAcarsFlightAction(formData: FormData) {
  const pilot = await requirePilotSession();
  const id = String(formData.get("sessionId") ?? "").trim();
  const existing = id ? await getAcarsSession(id) : null;
  if (!existing || existing.pilotId !== pilot.pilotId) redirect("/account/acars-recovery?error=not-found");
  if (!existing.lastSnapshot || existing.distanceNm < 5) redirect("/account/acars-recovery?error=insufficient-telemetry");
  const alreadySubmitted = await getPirepForAcarsSession(existing.id);
  if (alreadySubmitted) redirect(`/account/flights/${encodeURIComponent(alreadySubmitted.id)}`);

  const session = existing.status === "disconnected" || existing.status === "active"
    ? await recoverAcarsSession(existing.id, pilot.pilotId)
    : existing.status === "completed" ? existing : null;
  if (!session?.completedAt) redirect("/account/acars-recovery?error=not-recoverable");
  try {
    const { pirep } = await submitAcarsPirep(session, { recovered: true });
    revalidatePath("/account");
    revalidatePath("/account/acars-recovery");
    redirect(`/account/flights/${encodeURIComponent(pirep.id)}?recovered=1`);
  } catch {
    redirect("/account/acars-recovery?error=submit");
  }
}
