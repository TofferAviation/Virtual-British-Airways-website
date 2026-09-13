import { listLiveAcarsSessions } from "@/lib/acars-store";
import { getPilotBooking, getPilotFlightPlan } from "@/lib/pilot-operations-store";

export type CurrentFlightStatus = {
  id: string;
  pilotName: string;
  pilotNumber: string;
  flightNumber: string;
  callsign: string;
  from: string;
  to: string;
  aircraft: string;
  phase: string;
  connectionHealthy: boolean;
  startedAt: string;
  elapsedMinutes: number;
  estimatedMinutes: number | null;
  remainingMinutes: number | null;
  progressPercent: number | null;
};

function durationMinutes(value: string | null | undefined) {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric >= 600 ? Math.round(numeric / 60) : Math.round(numeric);
  const clock = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const words = /(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?/i.exec(value);
  if (!words) return null;
  const hours = Number(words[1] ?? 0); const minutes = Number(words[2] ?? 0);
  return hours || minutes ? hours * 60 + minutes : null;
}

function flightPhase(onGround: boolean | undefined, altitudeFt: number | undefined) {
  if (onGround) return "Ground operations";
  if ((altitudeFt ?? 0) < 10_000) return "Climb or descent";
  return "Cruise";
}

function callsignFor(flightNumber: string) {
  const number = flightNumber.replace(/^BA/i, "");
  return /^\d+$/.test(number) ? `BAW${number}` : flightNumber;
}

/** Public, read-only operational view backed only by active ACARS sessions. */
export async function listCurrentFlightStatuses(): Promise<CurrentFlightStatus[]> {
  const now = Date.now();
  const sessions = await listLiveAcarsSessions();
  return Promise.all(sessions.map(async (session) => {
    const [booking, plan] = await Promise.all([
      getPilotBooking(session.bookingId, session.pilotId),
      getPilotFlightPlan(session.bookingId, session.pilotId),
    ]);
    const estimatedMinutes = durationMinutes(plan?.simbriefBriefing?.blockTime) ?? durationMinutes(booking?.duration);
    const elapsedMinutes = Math.max(0, Math.floor((now - new Date(session.startedAt).getTime()) / 60_000));
    const remainingMinutes = estimatedMinutes == null ? null : Math.max(0, estimatedMinutes - elapsedMinutes);
    const progressPercent = estimatedMinutes == null || estimatedMinutes <= 0 ? null : Math.min(100, Math.round((elapsedMinutes / estimatedMinutes) * 100));
    return {
      id: session.id,
      pilotName: session.pilotName,
      pilotNumber: session.pilotNumber,
      flightNumber: session.flightNumber,
      callsign: callsignFor(session.flightNumber),
      from: session.from,
      to: session.to,
      aircraft: session.aircraft,
      phase: flightPhase(session.lastSnapshot?.onGround, session.lastSnapshot?.altitudeFt),
      connectionHealthy: session.connectionHealthy,
      startedAt: session.startedAt,
      elapsedMinutes,
      estimatedMinutes,
      remainingMinutes,
      progressPercent,
    };
  }));
}
