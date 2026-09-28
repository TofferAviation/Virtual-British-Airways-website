import { hubCodeForName } from "@/lib/hubs";
import type { PilotAccount } from "@/lib/pilot-store";
import { getPilotAircraftEligibility } from "@/lib/pilot-ranks";
import { getTomorrowIsoDate } from "@/lib/serverDate";
import { getFlightsFromStation } from "@/lib/route-store";

export type CareerDispatchSuggestion = {
  routeId: string;
  number: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  duration: string;
  aircraft: string;
  isVirtualService: boolean;
  scheduleScoringEnabled: boolean;
  date: string;
  reason: string;
};

function durationMinutes(value: string) {
  const match = /^(\d+)\s*h(?:\s*(\d+)\s*m)?$/i.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2] ?? 0) : Number.MAX_SAFE_INTEGER;
}

function reasonFor(pilot: PilotAccount, flight: { aircraft: string; scheduleScoringEnabled: boolean }) {
  if (pilot.careerExperience.focus === "operations") return flight.scheduleScoringEnabled
    ? "Scheduled service with operational timing enabled."
    : "Available network service from your home hub.";
  if (pilot.careerExperience.focus === "progression") return "Eligible sector supporting your accepted-flight history.";
  return "A current BAV network option from your home hub.";
}

/**
 * A read-only guide over the authoritative booking schedule. Suggestions
 * never reserve a seat, assign an aircraft or bypass eligibility checks.
 */
export async function getCareerDispatchSuggestions(pilot: PilotAccount): Promise<CareerDispatchSuggestion[]> {
  const date = getTomorrowIsoDate();
  const hub = hubCodeForName(pilot.hub);
  const flights = await getFlightsFromStation(hub, date, { includeVirtualFlexible: true });
  const available = flights.filter((flight) => {
    const eligibility = getPilotAircraftEligibility({ rank: pilot.rank, typeRatings: pilot.typeRatings, aircraft: flight.aircraft });
    return !flight.catalogueOnly && flight.slots > 0 && eligibility.eligible;
  });
  const sorted = [...available].sort((left, right) => {
    if (pilot.careerExperience.focus === "operations" && left.scheduleScoringEnabled !== right.scheduleScoringEnabled) return left.scheduleScoringEnabled ? -1 : 1;
    if (pilot.careerExperience.focus === "progression") return durationMinutes(left.duration) - durationMinutes(right.duration);
    return left.to.localeCompare(right.to) || left.departure.localeCompare(right.departure);
  });
  return sorted.slice(0, 3).map((flight) => ({
    routeId: flight.routeId,
    number: flight.number,
    from: flight.from,
    to: flight.to,
    departure: flight.departure,
    arrival: flight.arrival,
    duration: flight.duration,
    aircraft: flight.aircraft,
    isVirtualService: flight.virtualTimetable,
    scheduleScoringEnabled: flight.scheduleScoringEnabled,
    date,
    reason: reasonFor(pilot, flight),
  }));
}
