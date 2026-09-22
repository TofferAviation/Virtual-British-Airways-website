export type SiteTrafficPage = {
  path: string;
  pageViews: number;
  visits: number;
};

/** Aggregate session visits from a hosting-edge country code. */
export type SiteTrafficCountry = {
  code: string;
  visits: number;
};

export type SiteTrafficDay = {
  date: string;
  pageViews: number;
  visits: number;
  pages: SiteTrafficPage[];
  countries: SiteTrafficCountry[];
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
    const countries = Array.isArray(candidate.countries) ? candidate.countries : [];
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
      countries: countries.map((country) => {
        const item = country && typeof country === "object" ? country as Partial<SiteTrafficCountry> : {};
        const code = typeof item.code === "string" ? item.code.trim().toUpperCase() : "";
        return { code, visits: count(item.visits) };
      }).filter((country) => /^[A-Z]{2}$/.test(country.code) && country.visits > 0)
        .sort((left, right) => right.visits - left.visits || left.code.localeCompare(right.code))
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
