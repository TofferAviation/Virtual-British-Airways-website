import { airportByCode } from "@/data/airports";
import type { PilotPirep } from "@/lib/pilot-operations-store";

export type VirtualPassportStamp = {
  id: string;
  flightNumber: string;
  airportCode: string;
  airportName: string;
  country: string;
  completedDate: string;
  completedTime: string;
  weathered: boolean;
  rotation: number;
  ink: string;
};

const INK_TONES = ["#126b84", "#6a3e83", "#85502a", "#237047", "#94324f"];

// A country default covers the network, while airport overrides keep the
// multi-zone destinations on their actual arrival day.
const COUNTRY_TIME_ZONES: Record<string, string> = {
  "Antigua & Barbuda": "America/Antigua", Albania: "Europe/Tirane", Algeria: "Africa/Algiers", Argentina: "America/Argentina/Buenos_Aires", Austria: "Europe/Vienna", Bahamas: "America/Nassau", Bahrain: "Asia/Bahrain", Barbados: "America/Barbados", Belgium: "Europe/Brussels", Bermuda: "Atlantic/Bermuda", Brazil: "America/Sao_Paulo", Bulgaria: "Europe/Sofia", Cambodia: "Asia/Phnom_Penh", Canada: "America/Toronto", "Cayman Islands": "America/Cayman", Chile: "America/Santiago", China: "Asia/Shanghai", "Costa Rica": "America/Costa_Rica", Croatia: "Europe/Zagreb", Cyprus: "Asia/Nicosia", Czechia: "Europe/Prague", Denmark: "Europe/Copenhagen", "Dominican Republic": "America/Santo_Domingo", Egypt: "Africa/Cairo", Finland: "Europe/Helsinki", France: "Europe/Paris", "France/Switzerland": "Europe/Paris", Georgia: "Asia/Tbilisi", Germany: "Europe/Berlin", Ghana: "Africa/Accra", Gibraltar: "Europe/Gibraltar", Greece: "Europe/Athens", Grenada: "America/Grenada", Guernsey: "Europe/Guernsey", Guyana: "America/Guyana", "Hong Kong": "Asia/Hong_Kong", Hungary: "Europe/Budapest", Iceland: "Atlantic/Reykjavik", India: "Asia/Kolkata", Ireland: "Europe/Dublin", Israel: "Asia/Jerusalem", Italy: "Europe/Rome", Jamaica: "America/Jamaica", Japan: "Asia/Tokyo", Jersey: "Europe/Jersey", Jordan: "Asia/Amman", Kenya: "Africa/Nairobi", Luxembourg: "Europe/Luxembourg", Malaysia: "Asia/Kuala_Lumpur", Maldives: "Indian/Maldives", Malta: "Europe/Malta", Mauritius: "Indian/Mauritius", Mexico: "America/Mexico_City", Montenegro: "Europe/Podgorica", Morocco: "Africa/Casablanca", Netherlands: "Europe/Amsterdam", Nigeria: "Africa/Lagos", Norway: "Europe/Oslo", Pakistan: "Asia/Karachi", Poland: "Europe/Warsaw", Portugal: "Europe/Lisbon", Qatar: "Asia/Qatar", Romania: "Europe/Bucharest", "Saudi Arabia": "Asia/Riyadh", Singapore: "Asia/Singapore", Slovenia: "Europe/Ljubljana", "South Africa": "Africa/Johannesburg", Spain: "Europe/Madrid", "Sri Lanka": "Asia/Colombo", "St. Kitts & Nevis": "America/St_Kitts", "St. Lucia": "America/St_Lucia", Sweden: "Europe/Stockholm", Switzerland: "Europe/Zurich", Thailand: "Asia/Bangkok", "Trinidad & Tobago": "America/Port_of_Spain", Turkey: "Europe/Istanbul", "Turks & Caicos Islands": "America/Grand_Turk", "United Arab Emirates": "Asia/Dubai", "United Kingdom": "Europe/London", "United States": "America/New_York",
};

const AIRPORT_TIME_ZONES: Record<string, string> = {
  YVR: "America/Vancouver", YYZ: "America/Toronto", YUL: "America/Toronto", MEL: "Australia/Melbourne", SYD: "Australia/Sydney", GIG: "America/Sao_Paulo", EZE: "America/Argentina/Buenos_Aires", PDL: "Atlantic/Azores", FNC: "Atlantic/Madeira", TFS: "Atlantic/Canary", LPA: "Atlantic/Canary", ACE: "Atlantic/Canary", FUE: "Atlantic/Canary", PHX: "America/Phoenix", DEN: "America/Denver", DFW: "America/Chicago", IAH: "America/Chicago", ORD: "America/Chicago", AUS: "America/Chicago", BNA: "America/Chicago", MSY: "America/Chicago", STL: "America/Chicago", LAS: "America/Los_Angeles", LAX: "America/Los_Angeles", SAN: "America/Los_Angeles", SFO: "America/Los_Angeles", SEA: "America/Los_Angeles", PDX: "America/Los_Angeles", ATL: "America/New_York", BOS: "America/New_York", BWI: "America/New_York", CVG: "America/New_York", JFK: "America/New_York", EWR: "America/New_York", MIA: "America/New_York", MCO: "America/New_York", PHL: "America/New_York", PIT: "America/New_York", TPA: "America/New_York", IAD: "America/New_York", CUN: "America/Cancun", NAS: "America/Nassau", BDA: "Atlantic/Bermuda", TOS: "Europe/Oslo", IVL: "Europe/Helsinki", RVN: "Europe/Helsinki", CPT: "Africa/Johannesburg", JNB: "Africa/Johannesburg",
};

function stableSeed(value: string) {
  let hash = 17;
  for (const character of value.toUpperCase()) hash = Math.imul(hash, 31) + character.charCodeAt(0) | 0;
  return hash >>> 0;
}

function formatArrival(completedAt: string, timeZone: string) {
  const date = new Date(completedAt);
  if (Number.isNaN(date.getTime())) return { date: "RECORDED", time: "—" };
  const formatOptions = { timeZone, hourCycle: "h23" as const };
  return {
    date: new Intl.DateTimeFormat("en-GB", { ...formatOptions, day: "2-digit", month: "short", year: "numeric" }).format(date).toUpperCase(),
    time: new Intl.DateTimeFormat("en-GB", { ...formatOptions, hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

export function virtualPassportStamps(pireps: readonly PilotPirep[]): VirtualPassportStamp[] {
  return pireps
    .filter((pirep) => pirep.status !== "rejected")
    .map((pirep) => {
      const airportCode = pirep.to.trim().toUpperCase();
      const airport = airportByCode[airportCode];
      const airportName = airport?.name ?? "Arrival airport";
      const country = airport?.country ?? "Destination country";
      const timeZone = AIRPORT_TIME_ZONES[airportCode] ?? COUNTRY_TIME_ZONES[country] ?? "UTC";
      const arrival = formatArrival(pirep.completedAt, timeZone);
      const seed = stableSeed(pirep.id);
      const weathered = seed % 5 < 2;
      return {
        id: pirep.id,
        flightNumber: pirep.flightNumber.trim().toUpperCase() || "BAV flight",
        airportCode,
        airportName,
        country,
        completedDate: arrival.date,
        completedTime: arrival.time,
        weathered,
        rotation: weathered ? -2.5 + (seed % 51) / 10 : -0.8 + (seed % 17) / 20,
        ink: INK_TONES[seed % INK_TONES.length],
      };
    })
    .sort((left, right) => right.id.localeCompare(left.id));
}

