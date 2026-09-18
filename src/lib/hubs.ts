export const BAV_HUBS = [
  {
    code: "LHR",
    name: "London Heathrow",
    role: "Primary global hub",
    description: "High-frequency European links and long-haul network flying.",
  },
  {
    code: "LGW",
    name: "London Gatwick",
    role: "Leisure and long-haul hub",
    description: "Holiday, leisure and selected long-haul services.",
  },
  {
    code: "LCY",
    name: "London City",
    role: "Business and regional hub",
    description: "Fast, short-haul business and regional operations.",
  },
] as const;

export type BavHubCode = (typeof BAV_HUBS)[number]["code"];
export type BavHubName = (typeof BAV_HUBS)[number]["name"];

export function isBavHubCode(value: string): value is BavHubCode {
  return BAV_HUBS.some((hub) => hub.code === value.toUpperCase());
}

export function getBavHub(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return BAV_HUBS.find((hub) => hub.code === normalized || hub.name.toUpperCase() === normalized) ?? null;
}

/** Returns a canonical stored hub name, keeping old accounts on a valid hub. */
export function normalizeBavHub(value: unknown, fallback: BavHubName = "London Heathrow"): BavHubName {
  const hub = typeof value === "string" ? getBavHub(value) : null;
  return hub?.name ?? fallback;
}

export function hubCodeForName(value: string | null | undefined): BavHubCode {
  return getBavHub(value)?.code ?? "LHR";
}
