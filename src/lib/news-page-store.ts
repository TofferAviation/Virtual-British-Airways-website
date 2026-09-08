import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type NewsHeroMode = "image" | "editable";
export type NewsMainSection = "featured" | "secondary" | "latest";
export type NewsSidebarSection = "announcements" | "quick-links" | "promo";

export type NewsQuickLink = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: string;
};

export type NewsPageSettings = {
  heroMode: NewsHeroMode;
  heroImage: string;
  heroImagePosition: string;
  heroKicker: string;
  heroTitle: string;
  heroDescription: string;
  heroSideTitle: string;
  heroSideText: string;
  heroTagline: string;
  navLabels: {
    overview: string;
    latest: string;
    announcements: string;
    operations: string;
    community: string;
  };
  featuredArticleId: string;
  mainSections: NewsMainSection[];
  sidebarSections: NewsSidebarSection[];
  visibility: Record<NewsMainSection | NewsSidebarSection, boolean>;
  quickLinks: NewsQuickLink[];
  promoTitle: string;
  promoImage: string;
  promoImagePosition: string;
};

export const defaultNewsPageSettings: NewsPageSettings = {
  heroMode: "image",
  heroImage: "/branding/news-announcements-hero.png",
  heroImagePosition: "center center",
  heroKicker: "Newsroom",
  heroTitle: "News & announcements",
  heroDescription: "The latest virtual airline updates, service announcements, event news, route releases and community information from British Airways Virtual.",
  heroSideTitle: "Latest update",
  heroSideText: "Stay informed across the network.",
  heroTagline: "A global community · A brighter tomorrow",
  navLabels: {
    overview: "Overview",
    latest: "Latest news",
    announcements: "Announcements",
    operations: "Operations updates",
    community: "Community",
  },
  featuredArticleId: "",
  mainSections: ["featured", "secondary", "latest"],
  sidebarSections: ["announcements", "quick-links", "promo"],
  visibility: {
    featured: true,
    secondary: true,
    latest: true,
    announcements: true,
    "quick-links": true,
    promo: true,
  },
  quickLinks: [
    { id: "help", label: "Help centre", description: "Guides, FAQs and support", href: "/help", icon: "?" },
    { id: "status", label: "System status", description: "Live service information", href: "/service-status", icon: "◷" },
    { id: "events", label: "Events", description: "View upcoming community events", href: "/events", icon: "▣" },
    { id: "points", label: "VA Points", description: "Your balance and programme details", href: "/va-points", icon: "◇" },
    { id: "about", label: "About the VA", description: "Learn more about our community", href: "/about", icon: "♟" },
  ],
  promoTitle: "More than a simulation.\nA global community.",
  promoImage: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=84",
  promoImagePosition: "center 54%",
};

const dataDir = path.join(process.cwd(), ".bav-data");
const settingsFile = path.join(dataDir, "news-page.json");

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

function uniqueOrder<T extends string>(value: unknown, allowed: readonly T[], fallback: T[]) {
  if (!Array.isArray(value)) return [...fallback];
  const result = value.filter((item): item is T => typeof item === "string" && allowed.includes(item as T));
  return result.length ? [...new Set(result)] : [...fallback];
}

function normalizeNewsMediaUrl(value: unknown, fallback: string) {
  const url = typeof value === "string" && value.trim() ? value.trim() : fallback;
  const legacyPrefix = "/uploads/news/";
  if (url.startsWith(legacyPrefix)) {
    const filename = url.slice(legacyPrefix.length).split(/[?#]/, 1)[0];
    return filename ? `/api/news-media?file=${encodeURIComponent(filename)}` : fallback;
  }
  return url;
}

export function normalizeNewsPageSettings(input?: Partial<NewsPageSettings>): NewsPageSettings {
  const raw = input ?? {};
  const mainSections = uniqueOrder(raw.mainSections, ["featured", "secondary", "latest"] as const, defaultNewsPageSettings.mainSections);
  const sidebarSections = uniqueOrder(raw.sidebarSections, ["announcements", "quick-links", "promo"] as const, defaultNewsPageSettings.sidebarSections);
  const quickLinks = Array.isArray(raw.quickLinks)
    ? raw.quickLinks.slice(0, 8).map((item, index) => ({
        id: typeof item?.id === "string" && item.id.trim() ? item.id.trim() : `link-${index + 1}`,
        label: typeof item?.label === "string" ? item.label.slice(0, 60) : "Link",
        description: typeof item?.description === "string" ? item.description.slice(0, 120) : "",
        href: typeof item?.href === "string" ? item.href.slice(0, 300) : "/",
        icon: typeof item?.icon === "string" && item.icon ? item.icon.slice(0, 4) : "›",
      }))
    : defaultNewsPageSettings.quickLinks;

  return {
    ...defaultNewsPageSettings,
    ...raw,
    heroMode: raw.heroMode === "editable" ? "editable" : "image",
    heroImage: normalizeNewsMediaUrl(raw.heroImage, defaultNewsPageSettings.heroImage),
    heroImagePosition: typeof raw.heroImagePosition === "string" && raw.heroImagePosition.trim() ? raw.heroImagePosition.trim() : "center center",
    mainSections,
    sidebarSections,
    visibility: { ...defaultNewsPageSettings.visibility, ...(raw.visibility ?? {}) },
    navLabels: { ...defaultNewsPageSettings.navLabels, ...(raw.navLabels ?? {}) },
    quickLinks,
    promoImage: normalizeNewsMediaUrl(raw.promoImage, defaultNewsPageSettings.promoImage),
  };
}

export async function getNewsPageSettings(): Promise<NewsPageSettings> {
  try {
    const raw = await readFile(settingsFile, "utf8");
    return normalizeNewsPageSettings(JSON.parse(raw) as Partial<NewsPageSettings>);
  } catch {
    return normalizeNewsPageSettings();
  }
}

export async function saveNewsPageSettings(settings: NewsPageSettings) {
  await ensureDataDir();
  const normalized = normalizeNewsPageSettings(settings);
  const tmp = `${settingsFile}.tmp`;
  await writeFile(tmp, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await rename(tmp, settingsFile);
  return normalized;
}
