/** Aircraft offered by the pilot's dispatch aircraft menu, independent of route timetables. */
export const DISPATCH_AIRCRAFT: Record<string, string> = {
  "Airbus A319": "A319", "Airbus A320": "A320", "Airbus A320neo": "A20N",
  "Airbus A321": "A321", "Airbus A321neo": "A21N", "Airbus A330-200": "A332",
  "Airbus A330-300": "A333", "Airbus A330-900": "A339", "Airbus A350-900": "A359",
  "Airbus A350-1000": "A35K", "Airbus A380-800": "A388",
  "Boeing 737-700": "B737", "Boeing 737-800": "B738", "Boeing 737-900": "B739",
  "Boeing 737 MAX 8": "B38M", "Boeing 737 MAX 9": "B39M", "Boeing 747-400": "B744",
  "Boeing 777-200ER": "B772", "Boeing 777-300ER": "B77W",
  "Boeing 787-8": "B788", "Boeing 787-9": "B789", "Boeing 787-10": "B78X",
  "Embraer E170": "E170", "Embraer E175": "E75L", "Embraer E190": "E190", "Embraer E195": "E195",
  "ATR 72-600": "AT76", "De Havilland Dash 8 Q400": "DH8D",
};

export function allianceAircraftOptions(schedule: { aircraft: string; aircraftIcao: string }) {
  return [...new Set([...Object.keys(DISPATCH_AIRCRAFT), ...(schedule.aircraft && schedule.aircraftIcao ? [schedule.aircraft] : [])])];
}

export function allianceAircraftCode(aircraft: string, schedule: { aircraft: string; aircraftIcao: string }) {
  return Object.hasOwn(DISPATCH_AIRCRAFT, aircraft) ? DISPATCH_AIRCRAFT[aircraft] : aircraft === schedule.aircraft ? schedule.aircraftIcao : undefined;
}
