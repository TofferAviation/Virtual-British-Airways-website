"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePilotSession } from "@/lib/pilot-auth";
import { getActivePilotBooking, recordPilotPirep } from "@/lib/pilot-operations-store";
import type { SupportedSimulator } from "@/lib/acars-contract";

const simulators: SupportedSimulator[] = ["xplane12", "msfs2020", "msfs2024"];

export async function submitManualPirep(formData: FormData) {
  const session = await requirePilotSession();
  const booking = await getActivePilotBooking(session.pilotId);
  if (!booking) redirect("/operations/pirep?error=no-assignment");

  const blockMinutes = Math.max(1, Number(formData.get("blockMinutes") ?? 0));
  const distanceNm = Math.max(0, Number(formData.get("distanceNm") ?? 0));
  const landingRaw = String(formData.get("landingFpm") ?? "").trim();
  const fuelRaw = String(formData.get("fuelUsedKg") ?? "").trim();
  const simulatorRaw = String(formData.get("simulator") ?? "xplane12") as SupportedSimulator;
  const simulator = simulators.includes(simulatorRaw) ? simulatorRaw : "xplane12";
  const comments = String(formData.get("comments") ?? "").trim().slice(0, 2000);
  if (!Number.isFinite(blockMinutes) || !Number.isFinite(distanceNm)) redirect("/operations/pirep?error=invalid");

  const completedAt = new Date();
  const startedAt = new Date(completedAt.getTime() - blockMinutes * 60_000);
  await recordPilotPirep({
    pilotId: session.pilotId,
    bookingId: booking.id,
    flightNumber: booking.flightNumber,
    from: booking.from,
    to: booking.to,
    aircraft: booking.aircraft,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    blockMinutes: Math.round(blockMinutes),
    distanceNm: Math.round(distanceNm),
    landingFpm: landingRaw ? Math.round(Number(landingRaw)) : null,
    fuelUsedKg: fuelRaw ? Math.round(Number(fuelRaw)) : null,
    status: "pending",
    source: "manual",
    simulator,
    acarsSessionId: null,
    pilotComments: comments,
  });
  revalidatePath("/account");
  redirect("/account?pirep=submitted");
}
