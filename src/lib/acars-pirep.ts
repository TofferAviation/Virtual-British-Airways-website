import { arrivalResolutionNote, resolveAcarsArrival } from "@/lib/acars-arrival";
import { calculateAcarsFuelUsed } from "@/lib/acars-fuel";
import { reconcileFleetArrival } from "@/lib/acars-fleet-reconciliation";
import type { AcarsSession } from "@/lib/acars-store";
import { recordPilotPirep } from "@/lib/pilot-operations-store";

type Options = {
  landingFpm?: number | null;
  pilotComments?: string;
  simulatorBlockMinutes?: number | null;
  recovered?: boolean;
};

function blockMinutes(session: AcarsSession, requested: number | null | undefined) {
  const supplied = typeof requested === "number" && Number.isFinite(requested) ? Math.round(requested) : null;
  if (supplied != null && supplied >= 1 && supplied <= 72 * 60) return supplied;
  const endedAt = session.completedAt ?? session.lastSnapshot?.timestamp ?? session.updatedAt;
  return Math.max(1, Math.min(72 * 60, Math.round((new Date(endedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000)));
}

/** Writes the one, normal ACARS PIREP used by both a clean shutdown and recovery. */
export async function submitAcarsPirep(session: AcarsSession, options: Options = {}) {
  if (!session.completedAt) throw new Error("The ACARS session has not been completed.");
  const arrival = await resolveAcarsArrival(session);
  const fleet = await reconcileFleetArrival(session, arrival);
  const pilotComments = (options.pilotComments ?? "").trim().slice(0, 1800);
  const recoveryNote = options.recovered ? "Recovered from an interrupted Ember ACARS session." : "";
  const comments = [arrivalResolutionNote(arrival), recoveryNote, pilotComments ? `Pilot note: ${pilotComments}` : ""].filter(Boolean).join("\n\n").slice(0, 2000);
  const fuel = calculateAcarsFuelUsed(session);
  const pirep = await recordPilotPirep({
    pilotId: session.pilotId,
    bookingId: session.bookingId,
    flightNumber: session.flightNumber,
    from: session.from,
    to: arrival.actualStation ?? session.to,
    aircraft: session.aircraft,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    blockMinutes: blockMinutes(session, options.simulatorBlockMinutes),
    distanceNm: Math.max(0, Math.round(session.distanceNm)),
    landingFpm: options.landingFpm != null && Number.isFinite(options.landingFpm) ? Math.round(options.landingFpm) : session.landingFpm,
    fuelUsedKg: fuel.fuelUsedKg,
    status: "pending",
    source: "acars",
    simulator: session.simulator,
    acarsSessionId: session.id,
    pilotComments: comments,
  });
  return { pirep, arrival, fleet, fuel };
}
