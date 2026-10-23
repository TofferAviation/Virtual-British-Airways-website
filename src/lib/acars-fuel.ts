import type { AcarsSession } from "@/lib/acars-store";

/** A zero reading is missing remaining-fuel telemetry, not an empty airline aircraft. */
export function usableRemainingFuelKg(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Native trip counters begin at zero, so zero is valid for this measurement. */
export function usableFuelBurnKg(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000 ? value : null;
}

export type AcarsFuelResult = {
  fuelUsedKg: number | null;
  source: "aircraft_trip_counter" | "remaining_fuel_fallback" | "unavailable";
};

/**
 * The aircraft's own trip counter takes precedence. It is independent of
 * dispatch fuel and makes the result work for every airframe without a BAV
 * performance estimate. Older Ember versions retain a safe remaining-fuel
 * fallback. Unknown data is deliberately not presented as 0 kg.
 */
export function calculateAcarsFuelUsed(session: Pick<AcarsSession, "firstFuelKg" | "lastFuelKg" | "lastFuelBurnKg">): AcarsFuelResult {
  const reportedBurn = usableFuelBurnKg(session.lastFuelBurnKg);
  if (reportedBurn != null && reportedBurn > 0) return { fuelUsedKg: Math.round(reportedBurn), source: "aircraft_trip_counter" };

  const first = usableRemainingFuelKg(session.firstFuelKg);
  const last = usableRemainingFuelKg(session.lastFuelKg);
  if (first != null && last != null && first > last) return { fuelUsedKg: Math.round(first - last), source: "remaining_fuel_fallback" };

  return { fuelUsedKg: null, source: "unavailable" };
}
