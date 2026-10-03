/**
 * Converts the virtual-service reference used internally by BAV into the
 * identifiers pilots expect to see on a British Airways flight tracker.
 *
 * BA is the IATA flight-number prefix and BAW is the ICAO radiotelephony
 * designator. The original reference stays in the private booking/ACARS
 * record, so this is deliberately a display-only transformation.
 */
function britishAirwaysFlightSuffix(value: string) {
  const match = value.trim().toUpperCase().match(/^(?:BAV|BAW|BA)(\d{1,5})$/);
  return match?.[1] ?? null;
}

/**
 * ICAO designators used by the BA Group operators represented in BAV's
 * checked timetable. The value remains a route-level operational fact: this
 * list only prevents staff from accidentally entering an unrelated carrier.
 */
export const APPROVED_BA_GROUP_ICAO_DESIGNATORS = ["BAW", "CFE", "EFW", "SHT"] as const;

const approvedIcaoCallsignPattern = /^(?:BAW|CFE|EFW|SHT)\d{1,4}[A-Z]{0,2}$/;

export function normaliseApprovedBaGroupCallsign(value: string | null | undefined) {
  const candidate = value?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
  return approvedIcaoCallsignPattern.test(candidate) ? candidate : null;
}

export function toBritishAirwaysFlightNumber(value: string) {
  const normalised = value.trim().toUpperCase();
  const suffix = britishAirwaysFlightSuffix(normalised);
  return suffix ? `BA${suffix}` : normalised;
}

export function toBritishAirwaysCallsign(value: string) {
  const normalised = value.trim().toUpperCase();
  const suffix = britishAirwaysFlightSuffix(normalised);
  return suffix ? `BAW${suffix}` : normalised;
}

/**
 * A checked timetable may use an ICAO identifier that is not a mechanical
 * BAW + flight-number conversion (for example an operational alpha suffix).
 * Prefer that route-level source of truth whenever it is present.
 */
export function resolveBritishAirwaysCallsign(flightNumber: string, routeCallsign?: string | null) {
  return normaliseApprovedBaGroupCallsign(routeCallsign) ?? toBritishAirwaysCallsign(flightNumber);
}
