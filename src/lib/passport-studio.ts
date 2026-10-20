export const PASSPORT_STUDIO_DESIGNS = [
  { value: "heritage", label: "Heritage crest", description: "Classic embossed cover with a framed crest." },
  { value: "aeronautical", label: "Aeronautical", description: "Fine route lines and a technical aviation finish." },
  { value: "minimal", label: "Modern minimal", description: "Quiet typography and a clean, contemporary cover." },
  { value: "expedition", label: "Expedition", description: "A robust travel-journal cover with map-inspired detail." },
] as const;

export const PASSPORT_STUDIO_MATERIALS = [
  { value: "leather", label: "Full-grain leather" },
  { value: "chrome", label: "Brushed chrome" },
  { value: "carbon", label: "Carbon fibre" },
  { value: "tinted", label: "Tinted resin" },
] as const;

export const PASSPORT_STUDIO_TINTS = [
  { value: "midnight", label: "Midnight blue" },
  { value: "oxblood", label: "Oxblood" },
  { value: "emerald", label: "Emerald" },
  { value: "sapphire", label: "Sapphire" },
  { value: "silver", label: "Silver mist" },
] as const;

export const PASSPORT_STUDIO_FONTS = [
  { value: "classic", label: "Classic serif" },
  { value: "modern", label: "Modern sans" },
  { value: "technical", label: "Technical mono" },
  { value: "display", label: "Editorial display" },
] as const;

export const PASSPORT_STUDIO_MOTIFS = [
  { value: "crest", label: "Crest" },
  { value: "wings", label: "Wings" },
  { value: "compass", label: "Compass" },
  { value: "route", label: "Route line" },
] as const;

export const PASSPORT_STUDIO_FOILS = [
  { value: "gold", label: "Gold foil" },
  { value: "silver", label: "Silver foil" },
  { value: "copper", label: "Copper foil" },
  { value: "ice", label: "Ice foil" },
] as const;

export const PASSPORT_STUDIO_WEARS = [
  { value: "fresh", label: "Fresh from the studio" },
  { value: "journeyed", label: "Lightly journeyed" },
  { value: "weathered", label: "Weathered" },
] as const;

export type PassportStudio = {
  design: typeof PASSPORT_STUDIO_DESIGNS[number]["value"];
  material: typeof PASSPORT_STUDIO_MATERIALS[number]["value"];
  tint: typeof PASSPORT_STUDIO_TINTS[number]["value"];
  font: typeof PASSPORT_STUDIO_FONTS[number]["value"];
  motif: typeof PASSPORT_STUDIO_MOTIFS[number]["value"];
  foil: typeof PASSPORT_STUDIO_FOILS[number]["value"];
  wear: typeof PASSPORT_STUDIO_WEARS[number]["value"];
  title: string;
  monogram: string;
  coverColor: string;
  accentColor: string;
  texture: number;
  sheen: number;
};

export const DEFAULT_PASSPORT_STUDIO: PassportStudio = {
  design: "heritage", material: "leather", tint: "midnight", font: "classic", motif: "crest", foil: "gold", wear: "fresh",
  title: "BAV FLIGHT PASSPORT", monogram: "BAV", coverColor: "#102C5F", accentColor: "#E5BF60", texture: 42, sheen: 36,
};

function selected<T extends readonly { value: string }[]>(options: T, value: unknown, fallback: T[number]["value"]) {
  return typeof value === "string" && options.some((option) => option.value === value) ? value as T[number]["value"] : fallback;
}

function colour(value: unknown, fallback: string) {
  const input = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-f]{6}$/i.test(input) ? input.toUpperCase() : fallback;
}

function text(value: unknown, fallback: string, length: number) {
  const input = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, length) : "";
  return input || fallback;
}

function percentage(value: unknown, fallback: number) {
  const input = Number(value);
  return Number.isFinite(input) ? Math.round(Math.max(0, Math.min(100, input))) : fallback;
}

export function normalizePassportStudio(value: unknown): PassportStudio {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    design: selected(PASSPORT_STUDIO_DESIGNS, source.design, DEFAULT_PASSPORT_STUDIO.design), material: selected(PASSPORT_STUDIO_MATERIALS, source.material, DEFAULT_PASSPORT_STUDIO.material), tint: selected(PASSPORT_STUDIO_TINTS, source.tint, DEFAULT_PASSPORT_STUDIO.tint), font: selected(PASSPORT_STUDIO_FONTS, source.font, DEFAULT_PASSPORT_STUDIO.font), motif: selected(PASSPORT_STUDIO_MOTIFS, source.motif, DEFAULT_PASSPORT_STUDIO.motif), foil: selected(PASSPORT_STUDIO_FOILS, source.foil, DEFAULT_PASSPORT_STUDIO.foil), wear: selected(PASSPORT_STUDIO_WEARS, source.wear, DEFAULT_PASSPORT_STUDIO.wear),
    title: text(source.title, DEFAULT_PASSPORT_STUDIO.title, 32), monogram: text(source.monogram, DEFAULT_PASSPORT_STUDIO.monogram, 5).toUpperCase(), coverColor: colour(source.coverColor, DEFAULT_PASSPORT_STUDIO.coverColor), accentColor: colour(source.accentColor, DEFAULT_PASSPORT_STUDIO.accentColor), texture: percentage(source.texture, DEFAULT_PASSPORT_STUDIO.texture), sheen: percentage(source.sheen, DEFAULT_PASSPORT_STUDIO.sheen),
  };
}
