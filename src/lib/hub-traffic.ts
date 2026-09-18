import { listLiveAcarsSessions } from "@/lib/acars-store";
import { BAV_HUBS } from "@/lib/hubs";
import { listAllPireps } from "@/lib/pilot-operations-store";
import { getManagedRoutes } from "@/lib/route-store";

export type BavHubTraffic = {
  code: (typeof BAV_HUBS)[number]["code"];
  name: (typeof BAV_HUBS)[number]["name"];
  role: string;
  description: string;
  activeRoutes: number;
  completedDepartures: number;
  pilotsFlying: number;
  activityScore: number;
};

/**
 * This intentionally reports BAV operational activity rather than public
 * airport passenger numbers. It is therefore honest, live and useful to
 * pilots choosing where to fly in the virtual airline.
 */
export async function getBavHubTraffic(): Promise<BavHubTraffic[]> {
  const [routes, pireps, liveSessions] = await Promise.all([
    getManagedRoutes().catch((error) => {
      console.error("[hub-traffic] Could not load the BAV route schedule.", error);
      return [];
    }),
    listAllPireps().catch((error) => {
      console.error("[hub-traffic] Could not load PIREPs.", error);
      return [];
    }),
    listLiveAcarsSessions(),
  ]);

  return BAV_HUBS.map((hub) => {
    const completedDepartures = pireps.filter((pirep) => pirep.from === hub.code && pirep.status !== "rejected").length;
    const pilotsFlying = new Set(
      liveSessions.filter((session) => session.from === hub.code && session.connectionHealthy).map((session) => session.pilotId),
    ).size;
    return {
      ...hub,
      activeRoutes: routes.filter((route) => route.active && route.from === hub.code).length,
      completedDepartures,
      pilotsFlying,
      activityScore: completedDepartures + pilotsFlying,
    };
  });
}
