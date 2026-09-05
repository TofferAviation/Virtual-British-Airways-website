export type PhoenixPilotStats = {
  flights: number;
  flightHours: number;
  distanceNm: number;
  averageLandingFpm: number;
  bestLandingFpm: number;
  onTimePercent: number;
  vaPoints: number;
  tierPoints: number;
};

/**
 * Phoenix integration boundary.
 *
 * The production goal is for Phoenix and the website to consume the same
 * authoritative pilot record instead of maintaining independent stats.
 */
export async function getPhoenixPilotStats(): Promise<PhoenixPilotStats | null> {
  return null;
}
