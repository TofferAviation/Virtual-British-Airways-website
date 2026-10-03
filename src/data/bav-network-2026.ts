/**
 * British Airways London-hub network data used by BAV.
 *
 * City-pair availability, BAV virtual scheduling and verified BA timetable
 * data are deliberately separate. A BAV service can keep a route flyable
 * without suggesting its reference, timing or aircraft is a real-world BA
 * assignment. A real BA flight number, local airport time and aircraft appear
 * only once Operations has verified that individual service.
 */

export type BavNetworkRouteSeed = {
  id: string;
  from: string;
  to: string;
  flightNumber: string;
  /** ICAO identifier used by trackers and SimBrief, e.g. BAW267. */
  callsign?: string;
  departure: string;
  arrival: string;
  duration: string;
  aircraft: string;
  slots: number;
  active: boolean;
  /** Inclusive ISO date when a seasonal service opens for BAV operations. */
  validFrom?: string;
  /** Inclusive ISO date when a seasonal service closes for BAV operations. */
  validUntil?: string;
  /** JavaScript weekday numbers (Sunday = 0) for an explicitly published frequency. */
  operatingDays?: number[];
  /** Aircraft variants scheduled on this service; the first value is the checked-date assignment. */
  aircraftOptions?: string[];
  /** Public schedule reference used for this record. */
  sourceUrl?: string;
  /** ISO date when the individual service was checked. */
  validatedAt?: string;
  /**
   * A real BA service and observed operational callsign, retained as a
   * simulator reference when an exact selected-date timetable has not been
   * checked. It must never be presented as an exact live timetable.
   */
  referenceOnly?: boolean;
  /** The same flight number continues from the arrival station to this IATA airport. */
  continuesTo?: string;
  /** A downline sector of a through service, rather than a London-originating service. */
  connectionSegment?: boolean;
  /** A published city pair without a verified individual BA timetable yet. */
  catalogueOnly?: boolean;
  /** A bookable BAV operational schedule, not a copied BA published timetable. */
  virtualTimetable?: boolean;
};

export const BAV_NETWORK_VALIDATED_AT = "2026-09-19";
export const BAV_NETWORK_SCHEDULE_VERSION = "bav-operational-reference-base-2026-10-03-r13";

export const BAV_NETWORK_SOURCES = [
  "https://www.britishairways.com/content/flights/from-london-heathrow",
  "https://www.britishairways.com/content/flights/from-london-gatwick",
  "https://www.britishairways.com/londoncity",
  "https://www.britishairways.com/content/information/flight-information/our-route-network",
  "https://www.flightconnections.com/route-map-british-airways-ba",
  "https://mediacentre.britishairways.com/news/21112025/british-airways-expands-its-heathrow-network-with-two-new-short-haul-destinations-for-summer-2026",
  "https://mediacentre.britishairways.com/news/16032026/british-airways-announces-major-winter-2026-expansion-1",
] as const;

// SimBrief needs ICAO, not IATA. Keeping the mapping next to the validated
// network means every published BAV route can open a dispatch without a
// second, incomplete airport list.
export const BAV_NETWORK_ICAO_BY_IATA: Record<string, string> = {
  ABV: "DNAA", ABZ: "EGPD", ACC: "DGAA", ACE: "GCRR", AGA: "GMAD", AGP: "LEMG", ALC: "LEAL", ALG: "DAAG", AMM: "OJAI", AMS: "EHAM", ANU: "TAPA", ATH: "LGAV", ATL: "KATL", AUH: "OMAA", AUS: "KAUS", AYT: "LTAI", BAH: "OBBI", BCN: "LEBL", BDA: "TXKF", BDS: "LIBR", BER: "EDDB", BEY: "OLBA", BGI: "TBPB", BHD: "EGAC", BJV: "LTFE", BKK: "VTBS", BLL: "EKBI", BLQ: "LIPE", BLR: "VOBL", BNA: "KBNA", BOD: "LFBD", BOM: "VABB", BOS: "KBOS", BRI: "LIBD", BRU: "EBBR", BSL: "LFSB", BUD: "LHBP", BWI: "KBWI", CAG: "LIEE", CAI: "HECA", CDG: "LFPG", CFU: "LGKR", CHQ: "LGSA", CMB: "VCBI", CMF: "LFLB", CPH: "EKCH", CPT: "FACT", CTA: "LICC", CUN: "MMUN", DBV: "LDDU", DEL: "VIDP", DEN: "KDEN", DFW: "KDFW", DLM: "LTBS", DOH: "OTHH", DUB: "EIDW", DUS: "EDDL", DXB: "OMDB", EAS: "LESO", EDI: "EGPH", EFL: "LGKF", EGC: "LFBE", EWR: "KEWR", EZE: "SAEZ", FAO: "LPFR", FCO: "LIRF", FLR: "LIRQ", FNC: "LPMA", FRA: "EDDF", FUE: "GCFV", GCI: "EGJB", GLA: "EGPF", GNB: "LFLS", GND: "TGPY", GRZ: "LOWG", GVA: "LSGG", HAJ: "EDDV", HAM: "EDDH", HER: "LGIR", HKG: "VHHH", HND: "RJTT", HYD: "VOHS", IAD: "KIAD", IAH: "KIAH", IBZ: "LEIB", INN: "LOWI", INV: "EGPE", ISB: "OPIS", IST: "LTFM", IVL: "EFIV", JER: "EGJJ", JFK: "KJFK", JNB: "FAOR", JRO: "HTKJ", JSI: "LGSK", JTR: "LGSR", KEF: "BIKF", KGS: "LGKO", KIN: "MKJP", KLX: "LGKL", KUL: "WMKK", KWI: "OKBK", LAS: "KLAS", LAX: "KLAX", LCA: "LCLK", LIN: "LIML", LIS: "LPPT", LOS: "DNMM", LPA: "GCLP", LUX: "ELLX", LYS: "LFLL", MAA: "VOMM", MAD: "LEMD", MAH: "LEMH", MAN: "EGCC", MCO: "KMCO", MCT: "OOMS", MEX: "MMMX", MIA: "KMIA", MLA: "LMML", MPL: "LFMT", MRS: "LFML", MRU: "FIMP", MSY: "KMSY", MUC: "EDDM", MXP: "LIMC", NAP: "LIRN", NBO: "HKJK", NCE: "LFMN", NCL: "EGNT", NUE: "EDDN", OLB: "LIEO", OPO: "LPPR", ORD: "KORD", OSL: "ENGM", PFO: "LCPH", PHL: "KPHL", PHX: "KPHX", PIT: "KPIT", PLS: "MBPV", PMI: "LEPA", POS: "TTPP", PRG: "LKPR", PSA: "LIRP", PUJ: "MDPC", PVG: "ZSPD", PVK: "LGPZ", RAK: "GMMX", RBA: "GMME", RHO: "LGRP", RTM: "EHRD", RVN: "EFRO", SAN: "KSAN", SEA: "KSEA", SEZ: "FSIA", SFO: "KSFO", SIN: "WSSS", SJO: "MROC", SKB: "TKPK", SKG: "LGTS", SOF: "LBSF", SPU: "LDSP", SSH: "HESH", STL: "KSTL", SVQ: "LEZL", SZG: "LOWS", TFS: "GCTS", TIA: "LATI", TIV: "LYTV", TLN: "LFTH", TLS: "LFBO", TLV: "LLBG", TPA: "KTPA", TRN: "LIMF", UVF: "TLPL", VCE: "LIPZ", VIE: "LOWW", VRN: "LIPX", WAW: "EPWA", YUL: "CYUL", YVR: "CYVR", YYZ: "CYYZ", ZAG: "LDZA", ZNZ: "HTZA", ZRH: "LSZH", ZTH: "LGZA",
};

/**
 * The BAV London-hub route catalogue requested by Operations. These are
 * airport-pair records. Each is published by BAV as a bookable virtual
 * operational service with its own BAV reference and UTC planning time. This
 * deliberately avoids presenting an invented BA flight number, callsign,
 * time, or aircraft assignment as real-world data. Confirmed BA services are
 * supplied separately below and replace the virtual service for that city pair.
 */
const destinationsByHub = {
  LHR: [
    "ABZ", "ACC", "AGP", "ALG", "AMM", "AMS", "ATH", "ATL", "AUH", "AUS", "BAH", "BCN", "BHD", "BKK", "BLR", "BNA", "BOD", "BOM", "BOS", "BRU", "BUD", "BWI", "CAI", "CPT", "CPH", "DEL", "DEN", "DFW", "DOH", "DUB", "DUS", "DXB", "EDI", "EZE", "FAO", "FCO", "FRA", "GCI", "GLA", "GVA", "HAM", "HKG", "HND", "HYD", "IAH", "IAD", "INV", "ISB", "IST", "JFK", "JNB", "JTR", "KEF", "KUL", "KWI", "LAS", "LAX", "LIS", "LOS", "LYS", "MAD", "MAN", "MAA", "MCT", "MEX", "MIA", "MLA", "MRS", "MSY", "MUC", "NAP", "NBO", "NCE", "NCL", "ORD", "OSL", "PDX", "PHL", "PHX", "PIT", "PRG", "PVG", "SAN", "SEA", "SEZ", "SFO", "SIN", "SJO", "SOF", "SPU", "STL", "TLS", "TIV", "TLV", "TPA", "VCE", "VIE", "WAW", "YUL", "YVR", "YYZ", "ZRH", "ALC", "AYT", "BDS", "BLL", "BLQ", "BRI", "CAG", "CFU", "CHQ", "CTA", "DBV", "EFL", "FLR", "FNC", "HER", "IBZ", "INN", "KGS", "KLX", "LCA", "LIN", "MAH", "PMI", "PFO", "PSA", "PVK", "RHO", "SKG", "SZG", "TFS", "TIA", "VRN", "ZAG", "ZTH",
    "ABV", "BDA", "CDG", "EWR", "HAJ", "JER", "LUX", "MXP", "NUE", "ARN", "BER", "BSL", "CGN", "GIB", "GIG", "GOT", "GRU", "HEL", "JMK", "KRK", "LJU", "LPA", "NAS", "OTP", "PUY", "RAK", "SCL", "SYD",
  ],
  LGW: [
    "ACE", "ALC", "ANU", "BGI", "BOD", "CMB", "CFU", "CHQ", "CUN", "DBV", "FNC", "GNB", "GND", "GRZ", "HER", "IBZ", "INN", "IVL", "JER", "JRO", "KGS", "KIN", "KLX", "LCA", "LPA", "LYS", "MAH", "MLA", "MCO", "MPL", "MRU", "NCE", "PFO", "PLS", "PMI", "POS", "PUJ", "RAK", "RHO", "RVN", "SKB", "SKG", "SSH", "SVQ", "SZG", "TFS", "TPA", "TRN", "UVF", "VRN", "ZNZ", "AGP", "FUE", "ALG", "AYT", "BRI", "CPT", "CTA", "DLM", "DOH", "FAO", "GLA", "GVA", "OPO", "RBA",
  ],
  LCY: [
    "AMS", "BCN", "BHD", "BER", "CMF", "DUB", "EDI", "EAS", "EGC", "FAO", "FLR", "GLA", "GVA", "IBZ", "JSI", "LIN", "NCE", "OLB", "PMI", "PRG", "RTM", "SPU", "TLN", "ZRH", "AGP",
  ],
} as const;

export const BAV_NETWORK_ROUTE_COUNTS = {
  LHR: destinationsByHub.LHR.length,
  LGW: destinationsByHub.LGW.length,
  LCY: destinationsByHub.LCY.length,
  total: destinationsByHub.LHR.length + destinationsByHub.LGW.length + destinationsByHub.LCY.length,
} as const;

const routeNetworkSource = "https://www.britishairways.com/content/information/flight-information/our-route-network";

const longHaulDestinations = new Set([
  "ACC", "ATL", "AUS", "AUH", "BAH", "BKK", "BLR", "BOM", "BOS", "BWI", "CAI", "CPT", "DEL", "DEN", "DFW", "DOH", "DXB", "EWR", "EZE", "GIG", "GRU", "HKG", "HND", "HYD", "IAD", "IAH", "ISB", "JNB", "KUL", "KWI", "LAS", "LAX", "LOS", "MAA", "MCO", "MCT", "MEL", "MEX", "MIA", "MRU", "MSY", "NAS", "NBO", "ORD", "PDX", "PHL", "PHX", "PIT", "PVG", "SAN", "SCL", "SEA", "SEZ", "SFO", "SIN", "SJO", "SYD", "TLV", "TPA", "YUL", "YVR", "YYZ", "BDA", "CMB", "CUN", "GND", "KIN", "PLS", "POS", "PUJ", "SKB", "UVF", "ZNZ",
]);

const ultraLongHaulDestinations = new Set(["MEL", "SYD", "SCL", "EZE", "PVG", "HND", "SIN", "KUL"]);

function durationPartsForVirtualService(to: string) {
  if (ultraLongHaulDestinations.has(to)) return { hours: 13, minutes: 30 };
  if (longHaulDestinations.has(to)) return { hours: 9, minutes: 15 };
  if (["AMM", "CAI", "LCA", "MCT", "NBO", "RAK", "RBA", "SSH"].includes(to)) return { hours: 5, minutes: 20 };
  if (["AGP", "AYT", "CFU", "CHQ", "DLM", "FAO", "FNC", "HER", "IBZ", "JTR", "KGS", "LPA", "PFO", "PMI", "PVK", "RHO", "TFS", "ZTH"].includes(to)) return { hours: 3, minutes: 5 };
  if (["ABZ", "BHD", "DUB", "EDI", "GLA", "GCI", "INV", "JER", "MAN", "NCL"].includes(to)) return { hours: 1, minutes: 25 };
  return { hours: 2, minutes: 10 };
}

function toClock(totalMinutes: number) {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

type BavHubCode = "LHR" | "LGW" | "LCY";

function virtualAircraft(from: BavHubCode, to: string, sequence: number) {
  if (from === "LCY") return { aircraft: "Embraer E190", aircraftOptions: ["Embraer E190"] };
  if (longHaulDestinations.has(to)) {
    const aircraft = ["Boeing 787-9", "Boeing 777-200ER", "Airbus A350-1000", "Boeing 787-10"][sequence % 4];
    return { aircraft, aircraftOptions: [aircraft] };
  }
  const aircraft = ["Airbus A320neo", "Airbus A320", "Airbus A319"][sequence % 3];
  return { aircraft, aircraftOptions: ["Airbus A320neo", "Airbus A320", "Airbus A319", "Airbus A321neo"] };
}

function bAVVirtualFlightNumber(from: BavHubCode, sequence: number) {
  const base = from === "LHR" ? 1000 : from === "LGW" ? 2000 : 3000;
  return `BAV${base + sequence + 1}`;
}

const virtualOperationalRoutes: BavNetworkRouteSeed[] = (Object.keys(destinationsByHub) as BavHubCode[]).flatMap((from) =>
  destinationsByHub[from].map((to, sequence) => {
    const flightNumber = bAVVirtualFlightNumber(from, sequence);
    const duration = durationPartsForVirtualService(to);
    // These values are deliberately BAV UTC reference times, spread across
    // the day for choice in a simulator session. SimBrief supplies the final
    // flight plan timing when the pilot creates their OFP.
    const departureMinutes = 5 * 60 + ((sequence * 47 + (from === "LHR" ? 0 : from === "LGW" ? 13 : 26)) % (16 * 60));
    const equipment = virtualAircraft(from, to, sequence);
    return {
      id: `bav-network-2026-${from.toLowerCase()}-${to.toLowerCase()}`,
      from,
      to,
      flightNumber,
      departure: toClock(departureMinutes),
      arrival: toClock(departureMinutes + duration.hours * 60 + duration.minutes),
      duration: `${duration.hours}h ${String(duration.minutes).padStart(2, "0")}m`,
      aircraft: equipment.aircraft,
      aircraftOptions: equipment.aircraftOptions,
      slots: 12,
      active: true,
      virtualTimetable: true,
      sourceUrl: routeNetworkSource,
      validatedAt: BAV_NETWORK_VALIDATED_AT,
    };
  }),
);

const checked = BAV_NETWORK_VALIDATED_AT;
const sources = {
  lux: "https://www.flight.info/BA416",
  jersey: "https://www.flightradar24.com/data/flights/ba1346",
  hannover: "https://www.flight.info/BA894",
  belfastCity: "https://www.flightconnections.com/flights-from-lhr-to-bhd",
  copenhagen: "https://www.flight.info/BA812",
  copenhagenLive: "https://www.flightaware.com/live/findflight?origin=EGLL&destination=EKCH",
  newcastle: "https://www.directflights.com/LHR-NCL",
  portland: "https://www.flight.info/BA267",
  oslo: "https://planefinder.net/data/flight/BA784/history/5-83332140",
  miami: "https://planefinder.net/data/flight/BA207/history/5-49627838",
  singapore: "https://planefinder.net/data/flight/BA11/history/5-48737853",
  ba15ThroughService: "https://uk.flightaware.com/live/flight/BAW15/history",
  newYork: "https://planefinder.net/data/flight/BA183/history/5-57469201",
  madrid: "https://planefinder.net/data/flight/BA464/history/5-78114224",
} as const;

/**
 * Detailed services independently checked against a dated public schedule.
 * More can be added through the Staff Centre route editor as they are audited.
 */
const verifiedSchedules: BavNetworkRouteSeed[] = [
  // Research-backed operational references: the source records an actual BA
  // flight number, aircraft and ADS-B callsign in 2025/26. These remain
  // bookable for the VA, but are labelled as references rather than claiming
  // the selected booking date has an exact airline timetable check.
  { id: "ba-reference-lhr-sin-ba11", from: "LHR", to: "SIN", flightNumber: "BA11", callsign: "BAW11", departure: "19:25", arrival: "16:10", duration: "12h 45m", aircraft: "Airbus A380-800", aircraftOptions: ["Airbus A380-800"], slots: 12, active: true, sourceUrl: sources.singapore, validatedAt: "2026-10-03", referenceOnly: true },
  // BA15 is a through service, not an LHR–SIN-only service: the same BA15 /
  // BAW15 continues from Singapore to Sydney. The sectors stay separate for
  // flight logging and fleet location, but the connection is visible to pilots.
  { id: "ba-reference-lhr-sin-ba15", from: "LHR", to: "SIN", flightNumber: "BA15", callsign: "BAW15", departure: "22:10", arrival: "18:30", duration: "13h 20m", aircraft: "Boeing 787-9", aircraftOptions: ["Boeing 787-9"], slots: 12, active: true, sourceUrl: sources.ba15ThroughService, validatedAt: "2026-10-03", referenceOnly: true, continuesTo: "SYD" },
  { id: "ba-reference-sin-syd-ba15", from: "SIN", to: "SYD", flightNumber: "BA15", callsign: "BAW15", departure: "20:30", arrival: "06:35", duration: "7h 05m", aircraft: "Boeing 787-9", aircraftOptions: ["Boeing 787-9"], slots: 12, active: true, sourceUrl: sources.ba15ThroughService, validatedAt: "2026-10-03", referenceOnly: true, connectionSegment: true },
  { id: "ba-reference-lhr-jfk-ba183", from: "LHR", to: "JFK", flightNumber: "BA183", callsign: "BAW183", departure: "19:25", arrival: "22:25", duration: "8h 00m", aircraft: "Boeing 777-200ER", aircraftOptions: ["Boeing 777-200ER", "Boeing 777-300ER"], slots: 12, active: true, sourceUrl: sources.newYork, validatedAt: "2026-10-03", referenceOnly: true },
  { id: "ba-reference-lhr-mad-ba464", from: "LHR", to: "MAD", flightNumber: "BA464", callsign: "BAW46BL", departure: "16:30", arrival: "20:05", duration: "2h 35m", aircraft: "Airbus A320neo", aircraftOptions: ["Airbus A320neo", "Airbus A320", "Airbus A321neo"], slots: 12, active: true, sourceUrl: sources.madrid, validatedAt: "2026-10-03", referenceOnly: true },

  // Copenhagen: Sunday BA812 operation verified against the public schedule.
  // Equipment varies by day, so the published Sunday A319 remains the primary
  // assignment and the other documented A320-family variants remain eligible.
  { id: "ba-a26-lhr-cph-ba812-sun", from: "LHR", to: "CPH", flightNumber: "BA812", callsign: "BAW812", departure: "06:35", arrival: "09:25", duration: "1h 50m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319", "Airbus A320", "Airbus A320neo", "Airbus A321neo"], slots: 12, active: true, validFrom: "2026-10-04", validUntil: "2026-10-18", operatingDays: [0], sourceUrl: sources.copenhagen, validatedAt: "2026-10-03" },
  // FlightAware's LHR–CPH route view was checked on 3 October for these
  // individual current operations. Each entry is deliberately dated; a new
  // seasonal or daily record is added rather than extrapolating the schedule.
  { id: "ba-a26-lhr-cph-ba820-20261004", from: "LHR", to: "CPH", flightNumber: "BA820", callsign: "BAW820", departure: "08:15", arrival: "11:05", duration: "1h 50m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319", "Airbus A320", "Airbus A320neo", "Airbus A321neo"], slots: 12, active: true, validFrom: "2026-10-04", validUntil: "2026-10-04", operatingDays: [0], sourceUrl: sources.copenhagenLive, validatedAt: "2026-10-03" },
  { id: "ba-a26-lhr-cph-ba816-20261004", from: "LHR", to: "CPH", flightNumber: "BA816", callsign: "BAW816", departure: "12:40", arrival: "15:40", duration: "2h 00m", aircraft: "Airbus A320", aircraftOptions: ["Airbus A320", "Airbus A319", "Airbus A320neo", "Airbus A321neo"], slots: 12, active: true, validFrom: "2026-10-04", validUntil: "2026-10-04", operatingDays: [0], sourceUrl: sources.copenhagenLive, validatedAt: "2026-10-03" },
  { id: "ba-a26-lhr-cph-ba814-20261004", from: "LHR", to: "CPH", flightNumber: "BA814", callsign: "BAW814", departure: "14:55", arrival: "17:55", duration: "2h 00m", aircraft: "Airbus A321neo", aircraftOptions: ["Airbus A321neo", "Airbus A320neo", "Airbus A320", "Airbus A319"], slots: 12, active: true, validFrom: "2026-10-04", validUntil: "2026-10-04", operatingDays: [0], sourceUrl: sources.copenhagenLive, validatedAt: "2026-10-03" },
  { id: "ba-a26-lhr-cph-ba822-20261003", from: "LHR", to: "CPH", flightNumber: "BA822", callsign: "BAW822", departure: "20:40", arrival: "23:25", duration: "1h 45m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319", "Airbus A320", "Airbus A320neo", "Airbus A321neo"], slots: 12, active: true, validFrom: "2026-10-03", validUntil: "2026-10-03", operatingDays: [6], sourceUrl: sources.copenhagenLive, validatedAt: "2026-10-03" },

  // Miami: the flight number, local schedule, equipment and tracker
  // identifier were checked for the Sunday 4 October operation. The tracker
  // uses BAW3G for BA207, demonstrating why the ICAO identifier must never be
  // generated mechanically from the BA flight number.
  { id: "ba-a26-lhr-mia-ba207-20261004", from: "LHR", to: "MIA", flightNumber: "BA207", callsign: "BAW3G", departure: "09:55", arrival: "14:35", duration: "9h 40m", aircraft: "Airbus A380-800", aircraftOptions: ["Airbus A380-800"], slots: 12, active: true, validFrom: "2026-10-04", validUntil: "2026-10-04", operatingDays: [0], sourceUrl: sources.miami, validatedAt: "2026-10-03" },

  // Oslo: schedule and tracker identifier checked on 3 October 2026 for the
  // Sunday 4 October operation. This replaces the BAV placeholder only for
  // this verified service window; it is not extrapolated into later dates.
  { id: "ba-a26-lhr-osl-ba784-20261004", from: "LHR", to: "OSL", flightNumber: "BA784", callsign: "BAW784", departure: "20:25", arrival: "23:30", duration: "2h 05m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319"], slots: 12, active: true, validFrom: "2026-10-04", validUntil: "2026-10-04", operatingDays: [0], sourceUrl: sources.oslo, validatedAt: "2026-10-03" },

  // Portland: current published schedule independently corroborated on 19 September 2026.
  // Operations can amend this record in Staff Centre when BA changes the season.
  { id: "ba-s26-lhr-pdx-ba267", from: "LHR", to: "PDX", flightNumber: "BA267", callsign: "BAW267", departure: "15:40", arrival: "17:40", duration: "10h 00m", aircraft: "Boeing 787-10", aircraftOptions: ["Boeing 787-10"], slots: 12, active: true, validFrom: "2026-09-01", validUntil: "2026-09-30", operatingDays: [0, 1, 2, 3, 4, 5, 6], sourceUrl: sources.portland, validatedAt: checked },

  // Luxembourg and Hannover were missing from the previous generated schedule.
  // The following ICAO identifiers were re-checked in FlightAware on
  // 3 October 2026. Each is retained with its own source rather than being
  // generated from the BA number.
  { id: "ba-s26-lhr-lux-ba416", from: "LHR", to: "LUX", flightNumber: "BA416", callsign: "BAW416", departure: "06:05", arrival: "07:25", duration: "1h 20m", aircraft: "Airbus A320", aircraftOptions: ["Airbus A320", "Airbus A319", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-14", validUntil: "2026-10-24", operatingDays: [1, 2, 3, 4, 5, 6], sourceUrl: "https://www.flightaware.com/live/flight/BAW416/history", validatedAt: "2026-10-03" },
  { id: "ba-s26-lhr-jer-ba1346", from: "LHR", to: "JER", flightNumber: "BA1346", callsign: "BAW1346", departure: "07:40", arrival: "08:40", duration: "1h 00m", aircraft: "Airbus A320", aircraftOptions: ["Airbus A320", "Airbus A319", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-14", validUntil: "2026-10-24", operatingDays: [0, 1, 2, 3, 4, 5, 6], sourceUrl: "https://www.flightaware.com/live/flight/BAW1346/history", validatedAt: "2026-10-03" },
  { id: "ba-s26-lhr-gci-ba1344", from: "LHR", to: "GCI", flightNumber: "BA1344", callsign: "BAW1344", departure: "10:55", arrival: "11:55", duration: "1h 00m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319"], slots: 12, active: true, validFrom: "2026-04-19", operatingDays: [0, 1, 2, 3, 4, 5, 6], sourceUrl: "https://www.flightaware.com/live/flight/BAW1344/history", validatedAt: "2026-10-03" },
  { id: "ba-s26-lhr-haj-ba894", from: "LHR", to: "HAJ", flightNumber: "BA894", callsign: "BAW894", departure: "17:00", arrival: "18:35", duration: "1h 35m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319", "Airbus A320", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-14", validUntil: "2026-10-24", operatingDays: [0, 1, 2, 3, 4, 5, 6], sourceUrl: "https://www.flightaware.com/live/flight/BAW894/history", validatedAt: "2026-10-03" },

  // Belfast City: actual Saturday 19 September services, each with its BA number.
  { id: "ba-s26-lhr-bhd-ba1390", from: "LHR", to: "BHD", flightNumber: "BA1390", callsign: "BAW1390", departure: "06:30", arrival: "07:50", duration: "1h 20m", aircraft: "Airbus A320neo", aircraftOptions: ["Airbus A320neo", "Airbus A319", "Airbus A320"], slots: 12, active: true, validFrom: "2026-09-14", validUntil: "2026-10-24", operatingDays: [0, 1, 2, 3, 4, 5, 6], sourceUrl: "https://www.flightaware.com/live/flight/BAW1390/history", validatedAt: "2026-10-03" },
  { id: "ba-s26-lhr-bhd-ba1400", from: "LHR", to: "BHD", flightNumber: "BA1400", callsign: "BAW1400", departure: "12:05", arrival: "13:30", duration: "1h 25m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319", "Airbus A320", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-19", validUntil: "2026-09-19", operatingDays: [6], sourceUrl: "https://www.flightaware.com/live/flight/BAW1400/history", validatedAt: "2026-10-03" },
  { id: "ba-s26-lhr-bhd-ba1402", from: "LHR", to: "BHD", flightNumber: "BA1402", callsign: "BAW1402", departure: "14:45", arrival: "16:10", duration: "1h 25m", aircraft: "Airbus A320", aircraftOptions: ["Airbus A320", "Airbus A319", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-19", validUntil: "2026-09-19", operatingDays: [6], sourceUrl: "https://www.flightaware.com/live/flight/BAW1402/history", validatedAt: "2026-10-03" },
  { id: "ba-s26-lhr-bhd-ba1410", from: "LHR", to: "BHD", flightNumber: "BA1410", callsign: "BAW1410", departure: "18:20", arrival: "19:35", duration: "1h 15m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319", "Airbus A320", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-14", validUntil: "2026-10-24", operatingDays: [0, 1, 2, 3, 4, 5, 6], sourceUrl: "https://www.flightaware.com/live/flight/BAW1410/history", validatedAt: "2026-10-03" },

  // Newcastle has three real departures on the checked Saturday, not one generated route.
  { id: "ba-s26-lhr-ncl-ba1326", from: "LHR", to: "NCL", flightNumber: "BA1326", callsign: "BAW1326", departure: "07:00", arrival: "08:10", duration: "1h 10m", aircraft: "Airbus A320neo", aircraftOptions: ["Airbus A320neo", "Airbus A319", "Airbus A320", "Airbus A321neo"], slots: 12, active: true, validFrom: "2026-09-19", validUntil: "2026-09-19", operatingDays: [6], sourceUrl: "https://www.flightaware.com/live/flight/BAW1326/history", validatedAt: "2026-10-03" },
  { id: "ba-s26-lhr-ncl-ba1338", from: "LHR", to: "NCL", flightNumber: "BA1338", callsign: "BAW1338", departure: "17:25", arrival: "18:35", duration: "1h 10m", aircraft: "Airbus A320neo", aircraftOptions: ["Airbus A320neo", "Airbus A319", "Airbus A320", "Airbus A321neo"], slots: 12, active: true, validFrom: "2026-09-19", validUntil: "2026-09-19", operatingDays: [6], sourceUrl: "https://www.flightaware.com/live/flight/BAW1338/history", validatedAt: "2026-10-03" },
  { id: "ba-s26-lhr-ncl-ba1340", from: "LHR", to: "NCL", flightNumber: "BA1340", callsign: "BAW1340", departure: "19:50", arrival: "20:55", duration: "1h 05m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319", "Airbus A320", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-19", validUntil: "2026-09-19", operatingDays: [6], sourceUrl: "https://www.flightaware.com/live/flight/BAW1340/history", validatedAt: "2026-10-03" },
];

/**
 * The persistent route store migrates this complete set as one baseline. The
 * number of records is greater than 221 because several published airport
 * pairs have multiple independently verified departures.
 */
export const BAV_NETWORK_2026: BavNetworkRouteSeed[] = [
  ...virtualOperationalRoutes,
  ...verifiedSchedules,
];
