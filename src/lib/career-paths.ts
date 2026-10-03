import { hubCodeForName } from "@/lib/hubs";
import { getPilotAircraftEligibility } from "@/lib/pilot-ranks";
import { CAREER_PATH_DETAILS, type CareerPath, type CareerRotationLeg } from "@/lib/career-experience";
import type { PilotPirep } from "@/lib/pilot-operations-store";
import type { PilotAccount } from "@/lib/pilot-store";
import { getFlightsFromStation } from "@/lib/route-store";
import { getTomorrowIsoDate } from "@/lib/serverDate";

export type CareerPathProgress = {
  path: CareerPath;
  label: string;
  description: string;
  completed: number;
  target: number;
  targetLabel: string;
};

export type CareerRotationChoice = {
  id: string;
  title: string;
  description: string;
  legs: CareerRotationLeg[];
};

export type CareerRotationProgress = {
  completed: number;
  total: number;
  completedLegIndexes: number[];
  nextLeg: CareerRotationLeg | null;
  complete: boolean;
};

function durationMinutes(value: string) {
  const match = /^(\d+)\s*h(?:\s*(\d+)\s*m)?$/i.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2] ?? 0) : Number.MAX_SAFE_INTEGER;
}

function acceptedPireps(pireps: PilotPirep[]) {
  return pireps.filter((pirep) => pirep.status === "accepted");
}

export function getCareerPathProgress(path: CareerPath, pireps: PilotPirep[]): CareerPathProgress {
  const detail = CAREER_PATH_DETAILS[path];
  const accepted = acceptedPireps(pireps);
  let completed = 0;
  if (path === "network_explorer") completed = new Set(accepted.map((pirep) => pirep.to)).size;
  if (path === "short_haul_specialist") completed = accepted.filter((pirep) => pirep.distanceNm > 0 && pirep.distanceNm <= 1_200).length;
  if (path === "long_haul_explorer") completed = accepted.filter((pirep) => pirep.distanceNm >= 2_500).length;
  if (path === "aircraft_specialist") {
    const totals = new Map<string, number>();
    accepted.forEach((pirep) => totals.set(pirep.aircraft, (totals.get(pirep.aircraft) ?? 0) + 1));
    completed = Math.max(0, ...totals.values());
  }
  return { path, label: detail.label, description: detail.description, completed, target: detail.target, targetLabel: detail.targetLabel };
}

type RotationRoute = {
  routeId: string;
  number: string;
  from: string;
  to: string;
  aircraft: string;
  duration: string;
};

function toLeg(route: RotationRoute): CareerRotationLeg {
  return { routeId: route.routeId, flightNumber: route.number, from: route.from, to: route.to, aircraft: route.aircraft };
}

function uniqueRoutes(routes: RotationRoute[]) {
  const destinations = new Set<string>();
  return routes.filter((route) => {
    if (destinations.has(route.to)) return false;
    destinations.add(route.to);
    return true;
  });
}

/**
 * Rotations are read-only suggestions built from the current booking network.
 * Starting one only saves a personal target; it does not reserve flights,
 * alter a roster, or award any points, rank, qualification or finance value.
 */
export async function getCareerRotationChoices(pilot: PilotAccount): Promise<CareerRotationChoice[]> {
  const date = getTomorrowIsoDate();
  const routes = (await getFlightsFromStation(hubCodeForName(pilot.hub), date, { includeVirtualFlexible: true }))
    .filter((route) => !route.catalogueOnly && route.slots > 0 && getPilotAircraftEligibility({ rank: pilot.rank, typeRatings: pilot.typeRatings, aircraft: route.aircraft }).eligible);
  const unique = uniqueRoutes(routes);
  const choices: CareerRotationChoice[] = [];
  const shortHaul = unique.filter((route) => durationMinutes(route.duration) <= 210).slice(0, 3);
  const longHaul = unique.filter((route) => durationMinutes(route.duration) >= 360).slice(0, 3);
  const mixedNetwork = unique.slice(0, 3);
  if (mixedNetwork.length >= 3) choices.push({ id: "network-sampler", title: "Network sampler", description: "Three bookable destinations from your home hub, chosen from the current BAV schedule.", legs: mixedNetwork.map(toLeg) });
  if (shortHaul.length >= 3) choices.push({ id: "short-haul-circuit", title: "Short-haul circuit", description: "Three compact services for building confidence and a frequent-flyer rhythm.", legs: shortHaul.map(toLeg) });
  if (longHaul.length >= 2) choices.push({ id: "long-haul-pairing", title: "Long-haul pairing", description: "Two longer sectors from the current BAV schedule, designed for a more considered operation.", legs: longHaul.slice(0, 2).map(toLeg) });
  return choices;
}

export function getCareerRotationProgress(rotation: { startedAt: string; legs: CareerRotationLeg[] }, pireps: PilotPirep[]): CareerRotationProgress {
  const completedLegIndexes: number[] = [];
  const candidates = acceptedPireps(pireps).filter((pirep) => pirep.completedAt >= rotation.startedAt);
  for (const pirep of candidates) {
    const index = rotation.legs.findIndex((leg, candidateIndex) => !completedLegIndexes.includes(candidateIndex) && leg.flightNumber === pirep.flightNumber && leg.from === pirep.from && leg.to === pirep.to);
    if (index >= 0) completedLegIndexes.push(index);
  }
  const completed = completedLegIndexes.length;
  return { completed, total: rotation.legs.length, completedLegIndexes, nextLeg: rotation.legs.find((_, index) => !completedLegIndexes.includes(index)) ?? null, complete: completed === rotation.legs.length };
}
