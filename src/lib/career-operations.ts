import type { PilotBooking, PilotFlightPlan, PilotPirep } from "@/lib/pilot-operations-store";

const VIRTUAL_REST_HOURS = 12;

export type CareerOperationsPreview = {
  assignment: {
    title: string;
    detail: string;
    status: "planning" | "operating" | "none";
  };
  briefing: { title: string; detail: string };
  aircraft: { title: string; detail: string };
  rest: { title: string; detail: string; active: boolean };
};

function formatDuration(milliseconds: number) {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function formatUtc(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

/**
 * Produces an optional, read-only simulation aid from established BAV records.
 * It deliberately has no writes and never makes a booking, PIREP, qualification
 * or operational decision on a pilot's behalf.
 */
export function getCareerOperationsPreview(input: {
  booking: PilotBooking | null;
  flightPlan: PilotFlightPlan | null;
  pireps: PilotPirep[];
  now?: number;
}): CareerOperationsPreview {
  const { booking, flightPlan, pireps, now = Date.now() } = input;
  const latestAccepted = pireps.find((pirep) => pirep.status === "accepted" && Number.isFinite(Date.parse(pirep.completedAt)));
  const completedAt = latestAccepted ? Date.parse(latestAccepted.completedAt) : null;
  const restUntil = completedAt === null ? null : completedAt + VIRTUAL_REST_HOURS * 60 * 60 * 1000;
  const restActive = restUntil !== null && restUntil > now;

  return {
    assignment: booking
      ? {
          title: `${booking.flightNumber} · ${booking.from} → ${booking.to}`,
          detail: booking.status === "in_progress"
            ? `Operating · ${booking.aircraft}`
            : `${booking.date} · ${booking.departure}–${booking.arrival} reference time · ${booking.aircraft}`,
          status: booking.status === "in_progress" ? "operating" : "planning",
        }
      : { title: "No active assignment", detail: "Choose a BAV service whenever you are ready to plan.", status: "none" },
    briefing: !booking
      ? { title: "Briefing follows assignment", detail: "A SimBrief plan is available once a BAV flight is selected." }
      : flightPlan?.status === "synced"
        ? { title: "Briefing ready", detail: flightPlan.simbriefOfpId ? `SimBrief OFP #${flightPlan.simbriefOfpId} is linked to this assignment.` : "A SimBrief briefing is linked to this assignment." }
        : { title: "Briefing pending", detail: "Prepare or sync the optional SimBrief OFP from the flight desk." },
    aircraft: !booking
      ? { title: "Aircraft follows assignment", detail: "A compatible virtual aircraft is chosen during flight planning." }
      : booking.registration
        ? { title: `Registration ${booking.registration}`, detail: "This virtual airframe is linked to the active assignment." }
        : { title: "Aircraft selection pending", detail: "Choose an eligible virtual registration from the flight desk when available." },
    rest: !latestAccepted || completedAt === null || restUntil === null
      ? { title: "No rest guide yet", detail: "Your first accepted BAV PIREP can start an optional virtual rest timeline.", active: false }
      : restActive
        ? { title: "Suggested virtual rest in progress", detail: `${formatDuration(restUntil - now)} remaining after ${latestAccepted.flightNumber}. Suggested reset ends ${formatUtc(restUntil)}.`, active: true }
        : { title: "Suggested virtual rest complete", detail: `Your latest accepted flight, ${latestAccepted.flightNumber}, completed ${formatUtc(completedAt)}. The optional 12-hour reset has elapsed.`, active: false },
  };
}
