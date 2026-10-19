export type PassportNationality = string;

export const PASSPORT_NATIONALITIES = [
  "Australia", "Austria", "Belgium", "Brazil", "Canada", "China", "Denmark", "Finland", "France", "Germany", "Greece", "India", "Ireland", "Italy", "Japan", "Mexico", "Netherlands", "New Zealand", "Norway", "Poland", "Portugal", "Singapore", "South Africa", "Spain", "Sweden", "Switzerland", "Thailand", "United Arab Emirates", "United Kingdom", "United States",
] as const;

const THEMES: Record<string, { flag: string; ink: string; cover: string; edge: string }> = {
  Australia: { flag: "🇦🇺", ink: "#d6ae46", cover: "#123b79", edge: "#0c2a5e" },
  Canada: { flag: "🇨🇦", ink: "#e8ca8b", cover: "#a42031", edge: "#791522" },
  France: { flag: "🇫🇷", ink: "#d7b65d", cover: "#163c78", edge: "#0e2855" },
  Germany: { flag: "🇩🇪", ink: "#d4af51", cover: "#662f35", edge: "#3c191f" },
  India: { flag: "🇮🇳", ink: "#dec17c", cover: "#253f70", edge: "#142642" },
  Ireland: { flag: "🇮🇪", ink: "#e7c66e", cover: "#2c5d42", edge: "#1a3928" },
  Japan: { flag: "🇯🇵", ink: "#d7b26a", cover: "#6f2639", edge: "#481524" },
  Norway: { flag: "🇳🇴", ink: "#e0bd6b", cover: "#9d263b", edge: "#641525" },
  Singapore: { flag: "🇸🇬", ink: "#e7ca89", cover: "#a12c34", edge: "#631820" },
  "United Arab Emirates": { flag: "🇦🇪", ink: "#e6c56f", cover: "#355a43", edge: "#203828" },
  "United Kingdom": { flag: "🇬🇧", ink: "#e5bf60", cover: "#172e61", edge: "#0c1b3d" },
  "United States": { flag: "🇺🇸", ink: "#dfbf74", cover: "#233f72", edge: "#13284d" },
};

export function normalizePassportNationality(value: unknown): PassportNationality {
  const selected = typeof value === "string" ? value.trim() : "";
  return PASSPORT_NATIONALITIES.includes(selected as typeof PASSPORT_NATIONALITIES[number]) ? selected : "United Kingdom";
}

export function passportTheme(nationality: PassportNationality) {
  const selected = normalizePassportNationality(nationality);
  return THEMES[selected] ?? { flag: "✦", ink: "#e1be65", cover: "#274b68", edge: "#173246" };
}
