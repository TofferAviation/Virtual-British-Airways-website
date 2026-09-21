export type SiteTrafficPage = {
  path: string;
  pageViews: number;
  visits: number;
};

export type SiteTrafficDay = {
  date: string;
  pageViews: number;
  visits: number;
  pages: SiteTrafficPage[];
};

export type SiteTrafficState = {
  startedAt: string;
  days: SiteTrafficDay[];
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

export function normalizeSiteTraffic(input: unknown): SiteTrafficState {
  const source = input && typeof input === "object" ? input as Partial<SiteTrafficState> : {};
  const days = Array.isArray(source.days) ? source.days : [];
  const normalized = days.map((day) => {
    const candidate = day && typeof day === "object" ? day as Partial<SiteTrafficDay> : {};
    const pages = Array.isArray(candidate.pages) ? candidate.pages : [];
    return {
      date: typeof candidate.date === "string" && isoDate.test(candidate.date) ? candidate.date : "",
      pageViews: count(candidate.pageViews),
      visits: count(candidate.visits),
      pages: pages.map((page) => {
        const item = page && typeof page === "object" ? page as Partial<SiteTrafficPage> : {};
        return {
          path: typeof item.path === "string" ? item.path.slice(0, 160) : "",
          pageViews: count(item.pageViews),
          visits: count(item.visits),
        };
      }).filter((page) => page.path.startsWith("/"))
        .sort((left, right) => right.pageViews - left.pageViews)
        .slice(0, 80),
    };
  }).filter((day) => day.date)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 120);
  return {
    startedAt: typeof source.startedAt === "string" && !Number.isNaN(Date.parse(source.startedAt)) ? source.startedAt : new Date().toISOString(),
    days: normalized,
  };
}
