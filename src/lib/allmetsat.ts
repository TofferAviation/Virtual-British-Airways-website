const BASE_URL = "https://no.allmetsat.com/metar-taf";
const CACHE_MS = 5 * 60_000;

export type AllMetsatReport = {
  icao: string;
  metar: string | null;
  taf: string | null;
  sourceUrl: string;
  fetchedAt: string;
  available: boolean;
};

type CachedReport = {
  expiresAt: number;
  report: AllMetsatReport;
};

const reportCache = new Map<string, CachedReport>();

function regionPageForIcao(icao: string) {
  // AllMetsat's station selector is grouped by broad region. Keep the mapping
  // deliberately coarse so ICAO stations use a stable public page URL.
  switch (icao[0]) {
    case "C":
    case "K":
    case "M":
    case "T":
      return "nord-amerika.php";
    case "D":
    case "F":
    case "G":
    case "H":
      return "afrika.php";
    case "O":
    case "R":
    case "V":
    case "W":
    case "Z":
      return "asien.php";
    case "N":
    case "Y":
      return "australia-oseania.php";
    case "S":
      return "sor-amerika.php";
    default:
      return "europa.php";
  }
}

function normaliseIcao(value: string) {
  const icao = value.trim().toUpperCase();
  return /^[A-Z]{4}$/.test(icao) ? icao : null;
}

function cleanReport(value: string | undefined) {
  if (!value) return null;
  const compact = value
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return compact || null;
}

function extractReport(html: string, label: "METAR" | "TAF", icao: string) {
  // METAR/TAF strings on the provider page end before the next element. The
  // match is intentionally kept to one HTML line to avoid copying an entire
  // forecast explanation into the BA-Radar panel.
  const pattern = new RegExp(`${label}:\\s*(${icao}\\s+[^<\\r\\n]+)`, "i");
  return cleanReport(html.match(pattern)?.[1]);
}

export function allMetsatUrl(icao: string) {
  const normalised = normaliseIcao(icao);
  if (!normalised) return null;
  return `${BASE_URL}/${regionPageForIcao(normalised)}?icao=${encodeURIComponent(normalised)}`;
}

/**
 * Fetches a raw aviation weather report from AllMetsat on the server. This is
 * deliberately a read-only proxy: the browser receives a compact report and a
 * direct source link, not a cross-origin scrape or a supplier credential.
 */
export async function getAllMetsatReport(icaoInput: string): Promise<AllMetsatReport> {
  const icao = normaliseIcao(icaoInput);
  if (!icao) throw new Error("A four-letter ICAO station is required.");
  const now = Date.now();
  const cached = reportCache.get(icao);
  if (cached && cached.expiresAt > now) return cached.report;

  const sourceUrl = allMetsatUrl(icao)!;
  const fetchedAt = new Date().toISOString();
  try {
    const response = await fetch(sourceUrl, {
      cache: "no-store",
      headers: { Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`AllMetsat returned ${response.status}.`);
    const html = await response.text();
    const report: AllMetsatReport = {
      icao,
      metar: extractReport(html, "METAR", icao),
      taf: extractReport(html, "TAF", icao),
      sourceUrl,
      fetchedAt,
      available: true,
    };
    reportCache.set(icao, { expiresAt: now + CACHE_MS, report });
    return report;
  } catch {
    const report: AllMetsatReport = { icao, metar: null, taf: null, sourceUrl, fetchedAt, available: false };
    // Cache failures briefly only. A short retry is preferable to repeatedly
    // hitting the source when it has a transient outage.
    reportCache.set(icao, { expiresAt: now + 30_000, report });
    return report;
  }
}
