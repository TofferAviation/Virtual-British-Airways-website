import { getStaffState, saveStaffState } from "@/lib/staff-store";
import { normalizeSiteTraffic, type SiteTrafficDay, type SiteTrafficPage } from "@/lib/site-traffic-types";

const PRIVATE_PATHS = ["/api", "/_next", "/staff", "/account", "/login", "/register", "/staff-login", "/staff-invite", "/manage-assignment", "/flight-plans", "/operations", "/support/tickets"];

export function publicTrafficPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.length > 160 || value.startsWith("//")) return null;
  const path = value.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  return PRIVATE_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ? null : path;
}

/**
 * Records aggregate, first-party traffic only. No IP address, account identity,
 * browser fingerprint, search query or individual event history is retained.
 */
export async function recordSiteTraffic(pathInput: unknown, newVisit: boolean) {
  const path = publicTrafficPath(pathInput);
  if (!path) return false;
  const state = await getStaffState();
  const traffic = normalizeSiteTraffic(state.siteTraffic);
  const date = new Date().toISOString().slice(0, 10);
  let day = traffic.days.find((item) => item.date === date);
  if (!day) {
    day = { date, pageViews: 0, visits: 0, pages: [] };
    traffic.days.unshift(day);
  }
  day.pageViews += 1;
  if (newVisit) day.visits += 1;
  let page = day.pages.find((item) => item.path === path);
  if (!page) {
    page = { path, pageViews: 0, visits: 0 };
    day.pages.push(page);
  }
  page.pageViews += 1;
  if (newVisit) page.visits += 1;
  day.pages.sort((left, right) => right.pageViews - left.pageViews);
  state.siteTraffic = normalizeSiteTraffic(traffic);
  await saveStaffState(state);
  return true;
}

export type SiteTrafficSummary = {
  startedAt: string;
  today: SiteTrafficDay;
  totals: { pageViews: number; visits: number };
  recentDays: SiteTrafficDay[];
  popularPages: SiteTrafficPage[];
};

export async function getSiteTrafficSummary(): Promise<SiteTrafficSummary> {
  const traffic = normalizeSiteTraffic((await getStaffState()).siteTraffic);
  const todayDate = new Date().toISOString().slice(0, 10);
  const today = traffic.days.find((item) => item.date === todayDate) ?? { date: todayDate, pageViews: 0, visits: 0, pages: [] };
  const pages = new Map<string, SiteTrafficPage>();
  for (const day of traffic.days) {
    for (const page of day.pages) {
      const aggregate = pages.get(page.path) ?? { path: page.path, pageViews: 0, visits: 0 };
      aggregate.pageViews += page.pageViews;
      aggregate.visits += page.visits;
      pages.set(page.path, aggregate);
    }
  }
  return {
    startedAt: traffic.startedAt,
    today,
    totals: {
      pageViews: traffic.days.reduce((sum, day) => sum + day.pageViews, 0),
      visits: traffic.days.reduce((sum, day) => sum + day.visits, 0),
    },
    recentDays: [...traffic.days].sort((left, right) => left.date.localeCompare(right.date)).slice(-14),
    popularPages: [...pages.values()].sort((left, right) => right.pageViews - left.pageViews).slice(0, 10),
  };
}
