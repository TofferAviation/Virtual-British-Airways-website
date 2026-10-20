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

export const PASSPORT_STUDIO_WEARS = [
  { value: "fresh", label: "Fresh from the studio" },
  { value: "journeyed", label: "Lightly journeyed" },
  { value: "weathered", label: "Weathered" },
] as const;

export type PassportStudio = {
  design: typeof PASSPORT_STUDIO_DESIGNS[number]["value"];
  material: typeof PASSPORT_STUDIO_MATERIALS[number]["value"];
  tint: typeof PASSPORT_STUDIO_TINTS[number]["value"];
  wear: typeof PASSPORT_STUDIO_WEARS[number]["value"];
};

export const DEFAULT_PASSPORT_STUDIO: PassportStudio = {
  design: "heritage",
  material: "leather",
  tint: "midnight",
  wear: "fresh",
};

function selected<T extends readonly { value: string }[]>(options: T, value: unknown, fallback: T[number]["value"]) {
  return typeof value === "string" && options.some((option) => option.value === value) ? value as T[number]["value"] : fallback;
}

export function normalizePassportStudio(value: unknown): PassportStudio {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    design: selected(PASSPORT_STUDIO_DESIGNS, source.design, DEFAULT_PASSPORT_STUDIO.design),
    material: selected(PASSPORT_STUDIO_MATERIALS, source.material, DEFAULT_PASSPORT_STUDIO.material),
    tint: selected(PASSPORT_STUDIO_TINTS, source.tint, DEFAULT_PASSPORT_STUDIO.tint),
    wear: selected(PASSPORT_STUDIO_WEARS, source.wear, DEFAULT_PASSPORT_STUDIO.wear),
  };
}
