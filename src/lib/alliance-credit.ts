import type { AllianceBookingSnapshot, AllianceLedgerEntry } from "@/lib/alliance";
import type { PilotAccount } from "@/lib/pilot-store";
import type { PilotPirep } from "@/lib/pilot-operations-store";
import type { RewardSettings } from "@/lib/reward-settings";
import { awardsForAcceptedPirep, isHeathrowStation } from "@/lib/pilot-awards";
import { automaticPilotRank } from "@/lib/pilot-ranks";

export type AllianceReview = { decision: "accepted" | "rejected" | "changes_requested" | "reverse" | "adjust"; reason: string; actor: string; expectedRevision: number; seconds?: number };
export type AllianceCreditMutation = { entry: Omit<AllianceLedgerEntry, "id" | "createdAt"> | null; pilot: PilotAccount; status: PilotPirep["status"]; points: number; tierPoints: number };

/** Pure transaction preparation. The database independently locks/checks both source records. */
export function prepareAllianceCredit(input: {
  pilot: PilotAccount; pirep: PilotPirep; snapshot: AllianceBookingSnapshot; history: AllianceLedgerEntry[];
  review: AllianceReview; rewards: RewardSettings; points: number; tierPoints: number; salary: number; now: string;
}): AllianceCreditMutation {
  const { pirep, snapshot, review, history } = input;
  if (!review.actor || review.reason.trim().length < 3) throw new Error("A staff identity and review reason are required.");
  if (pirep.pilotId !== input.pilot.id || !snapshot.operator.id || !snapshot.policy.version) throw new Error("Missing or mismatched alliance metadata.");
  if (history.some(e => e.pirepId !== pirep.id || e.pilotId !== pirep.pilotId || e.carrierId !== snapshot.operator.id)) throw new Error("Credit ledger does not match this report.");
  const revision = Math.max(0, ...history.map(e => e.revision));
  if (review.expectedRevision !== revision) throw new Error("This report changed during review. Refresh before reviewing again.");
  const first = history.find(e => e.kind === "approval");
  const total = (key: "seconds" | "careerSeconds" | "sectors" | "distanceNm" | "points" | "tierPoints" | "salary" | "xp") => history.reduce((sum, e) => sum + (e[key] ?? 0), 0);
  const rounded = (n: number) => Math.round(n * 10) / 10;
  const money = (n: number) => Math.round(n * 100) / 100;
  const pilot = structuredClone(input.pilot);
  if (["rejected", "changes_requested"].includes(review.decision)) {
    if (first) throw new Error("Reverse an approved report before changing its credit status.");
    return { entry: null, pilot, status: review.decision as PilotPirep["status"], points: 0, tierPoints: 0 };
  }
  if (!Number.isFinite(pirep.blockMinutes) || pirep.blockMinutes <= 0 || pirep.blockMinutes > 2880 || !Number.isFinite(pirep.distanceNm) || pirep.distanceNm < 0) throw new Error("Invalid validated flight time or distance.");
  const baseSeconds = Math.round(pirep.blockMinutes * 60);
  let seconds: number, careerSeconds: number, sectors: number, distanceNm: number, points: number, tierPoints: number, salary: number;
  let kind: AllianceLedgerEntry["kind"];
  // The first approval fixes the credit policy for every subsequent correction.
  const policy = first?.policy ?? snapshot.policy;
  if (review.decision === "accepted") {
    if (first) throw new Error("This report has already been credited. Use an adjustment or reversal.");
    if (pirep.status === "accepted") throw new Error("Historical approved reports must be reconciled explicitly, never automatically re-credited.");
    seconds = baseSeconds; careerSeconds = policy.career ? seconds : 0; sectors = 1; distanceNm = Math.round(pirep.distanceNm);
    points = policy.points ? input.points : 0; tierPoints = policy.tierPoints ? input.tierPoints : 0; salary = policy.salary ? input.salary : 0; kind = "approval";
  } else {
    if (!first || pirep.status !== "accepted" || total("sectors") !== 1) throw new Error("Only an active, approved credit can be adjusted or reversed.");
    if (review.decision === "reverse") {
      seconds = -total("seconds"); careerSeconds = -total("careerSeconds"); sectors = -1; distanceNm = -total("distanceNm"); points = -total("points"); tierPoints = -total("tierPoints"); salary = -total("salary"); kind = "reversal";
    } else {
      if (!Number.isInteger(review.seconds) || review.seconds! < 60 || review.seconds! > 172800) throw new Error("Corrected total block time must be 60–172800 seconds.");
      seconds = review.seconds! - total("seconds");
      if (!seconds) throw new Error("The corrected time is unchanged.");
      careerSeconds = policy.career ? seconds : 0; sectors = 0; distanceNm = 0;
      points = rounded(first.points * review.seconds! / first.seconds - total("points")); tierPoints = Math.round(first.tierPoints * review.seconds! / first.seconds) - total("tierPoints");
      salary = money(first.salary * review.seconds! / first.seconds - total("salary")); kind = "adjustment";
    }
  }
  for (const value of [points, tierPoints, salary]) if (!Number.isFinite(value)) throw new Error("Invalid reward calculation.");
  const xp = kind === "approval" ? Math.round(seconds / 3600 * (policy.xpPerHour ?? 0)) : kind === "reversal" ? -total("xp") : Math.round((total("seconds") + seconds) / 3600 * (policy.xpPerHour ?? 0)) - total("xp");
  pilot.allianceXp = Math.max(0, (pilot.allianceXp ?? 0) + xp);
  const beforeFlights = pilot.flights;
  pilot.hours = Math.max(0, (Math.round(pilot.hours * 3600) + careerSeconds) / 3600);
  pilot.allianceUncreditedSeconds = Math.max(0, (pilot.allianceUncreditedSeconds ?? 0) + seconds - careerSeconds);
  pilot.allianceRankExcludedSeconds = Math.max(0, (pilot.allianceRankExcludedSeconds ?? 0) + (policy.rank ? 0 : careerSeconds));
  pilot.flights = Math.max(0, pilot.flights + sectors);
  pilot.distanceNm = Math.max(0, pilot.distanceNm + distanceNm);
  pilot.heathrowDepartures = Math.max(0, pilot.heathrowDepartures + (isHeathrowStation(pirep.from) ? sectors : 0));
  pilot.points = rounded(pilot.points + points); pilot.tierPoints += tierPoints; pilot.lifetimeTierPoints += tierPoints;
  // Rewards already spent are not a reason to retain invalid credit: a correction
  // may leave a negative virtual points balance, visible to staff and the pilot.
  if (policy.rank) pilot.rank = pilot.rankOverride ?? automaticPilotRank(pilot.hours - (pilot.allianceRankExcludedSeconds ?? 0) / 3600);
  pilot.tier = pilot.tierPoints >= input.rewards.tierGoldThreshold ? "Gold" : pilot.tierPoints >= input.rewards.tierSilverThreshold ? "Silver" : pilot.tierPoints >= input.rewards.tierBronzeThreshold ? "Bronze" : "Blue";
  if (sectors === 1) {
    pilot.streak += 1;
    const earned = awardsForAcceptedPirep({ flights: pilot.flights, totalDistanceNm: pilot.distanceNm, heathrowDepartures: pilot.heathrowDepartures, aircraft: pirep.aircraft, distanceNm: pirep.distanceNm }, pilot.awards);
    pilot.awards.push(...earned.map(a => ({ id: a.id, awardedAt: input.now, sourcePirepId: pirep.id, eventId: null, eventTitle: null })));
    if (pirep.landingFpm !== null) {
      pilot.averageLanding = pilot.averageLanding === null ? pirep.landingFpm : Math.round((pilot.averageLanding * beforeFlights + pirep.landingFpm) / Math.max(1, pilot.flights));
      pilot.bestLanding = pilot.bestLanding === null ? pirep.landingFpm : Math.max(pilot.bestLanding, pirep.landingFpm);
    }
  } else if (sectors === -1) {
    pilot.streak = Math.max(0, pilot.streak - 1);
    pilot.awards = pilot.awards.filter(a => a.sourcePirepId !== pirep.id);
    if (pirep.landingFpm !== null && pilot.averageLanding !== null) pilot.averageLanding = pilot.flights ? Math.round((pilot.averageLanding * beforeFlights - pirep.landingFpm) / pilot.flights) : null;
    if (pilot.bestLanding === pirep.landingFpm) pilot.bestLanding = null; // Cannot infer an unrecorded historical best.
  }
  const entry = { pirepId: pirep.id, pilotId: pirep.pilotId, carrierId: snapshot.operator.id, revision: revision + 1, kind, seconds, careerSeconds, sectors, distanceNm, points, tierPoints, salary, xp, policy, reason: review.reason.trim(), actor: review.actor, flight: { flightNumber: pirep.flightNumber, from: pirep.from, to: pirep.to, aircraft: pirep.aircraft, completedAt: pirep.completedAt } };
  return { entry, pilot, status: kind === "reversal" ? "rejected" : "accepted", points: rounded(total("points") + points), tierPoints: total("tierPoints") + tierPoints };
}
