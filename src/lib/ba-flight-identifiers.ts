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
