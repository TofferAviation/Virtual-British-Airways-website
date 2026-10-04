/**
 * British Airways London-hub network data used by BAV.
 *
 * City-pair availability, BAV virtual scheduling and verified BA timetable
 * data are deliberately separate. A BAV service can keep a route flyable
 * without suggesting its reference, timing or aircraft is a real-world BA
 * assignment. A real BA flight number, local airport time and aircraft appear
 * only once Operations has verified that individual service.
 */

import { heathrowCallsignReferences } from "./ba-heathrow-callsign-reference-2026";

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
export const BAV_NETWORK_SCHEDULE_VERSION = "bav-operational-reference-heathrow-2026-10-04-r17";

export const BAV_NETWORK_SOURCES = [
  "https://www.britishairways.com/content/flights/from-london-heathrow",
  "https://www.britishairways.com/content/flights/from-london-gatwick",
  "https://www.britishairways.com/londoncity",
  "https://www.britishairways.com/content/information/flight-information/our-route-network",
  "https://www.flightconnections.com/route-map-british-airways-ba",
  "https://speedbird.online/flightnumbers.php/airport_detail.php?iata=LHR",
  "https://mediacentre.britishairways.com/news/21112025/british-airways-expands-its-heathrow-network-with-two-new-short-haul-destinations-for-summer-2026",
  "https://mediacentre.britishairways.com/news/16032026/british-airways-announces-major-winter-2026-expansion-1",
] as const;

// SimBrief needs ICAO, not IATA. Keeping the mapping next to the validated
// network means every published BAV route can open a dispatch without a
// second, incomplete airport list.
const BAV_NETWORK_ICAO_BASE_BY_IATA: Record<string, string> = {
  ABV: "DNAA", ABZ: "EGPD", ACC: "DGAA", ACE: "GCRR", AGA: "GMAD", AGP: "LEMG", ALC: "LEAL", ALG: "DAAG", AMM: "OJAI", AMS: "EHAM", ANU: "TAPA", ATH: "LGAV", ATL: "KATL", AUH: "OMAA", AUS: "KAUS", AYT: "LTAI", BAH: "OBBI", BCN: "LEBL", BDA: "TXKF", BDS: "LIBR", BER: "EDDB", BEY: "OLBA", BGI: "TBPB", BHD: "EGAC", BJV: "LTFE", BKK: "VTBS", BLL: "EKBI", BLQ: "LIPE", BLR: "VOBL", BNA: "KBNA", BOD: "LFBD", BOM: "VABB", BOS: "KBOS", BRI: "LIBD", BRU: "EBBR", BSL: "LFSB", BUD: "LHBP", BWI: "KBWI", CAG: "LIEE", CAI: "HECA", CDG: "LFPG", CFU: "LGKR", CHQ: "LGSA", CMB: "VCBI", CMF: "LFLB", CPH: "EKCH", CPT: "FACT", CTA: "LICC", CUN: "MMUN", DBV: "LDDU", DEL: "VIDP", DEN: "KDEN", DFW: "KDFW", DLM: "LTBS", DOH: "OTHH", DUB: "EIDW", DUS: "EDDL", DXB: "OMDB", EAS: "LESO", EDI: "EGPH", EFL: "LGKF", EGC: "LFBE", EWR: "KEWR", EZE: "SAEZ", FAO: "LPFR", FCO: "LIRF", FLR: "LIRQ", FNC: "LPMA", FRA: "EDDF", FUE: "GCFV", GCI: "EGJB", GLA: "EGPF", GNB: "LFLS", GND: "TGPY", GRZ: "LOWG", GVA: "LSGG", HAJ: "EDDV", HAM: "EDDH", HER: "LGIR", HKG: "VHHH", HND: "RJTT", HYD: "VOHS", IAD: "KIAD", IAH: "KIAH", IBZ: "LEIB", INN: "LOWI", INV: "EGPE", ISB: "OPIS", IST: "LTFM", IVL: "EFIV", JER: "EGJJ", JFK: "KJFK", JNB: "FAOR", JRO: "HTKJ", JSI: "LGSK", JTR: "LGSR", KEF: "BIKF", KGS: "LGKO", KIN: "MKJP", KLX: "LGKL", KUL: "WMKK", KWI: "OKBK", LAS: "KLAS", LAX: "KLAX", LCA: "LCLK", LIN: "LIML", LIS: "LPPT", LOS: "DNMM", LPA: "GCLP", LUX: "ELLX", LYS: "LFLL", MAA: "VOMM", MAD: "LEMD", MAH: "LEMH", MAN: "EGCC", MCO: "KMCO", MCT: "OOMS", MEX: "MMMX", MIA: "KMIA", MLA: "LMML", MPL: "LFMT", MRS: "LFML", MRU: "FIMP", MSY: "KMSY", MUC: "EDDM", MXP: "LIMC", NAP: "LIRN", NBO: "HKJK", NCE: "LFMN", NCL: "EGNT", NUE: "EDDN", OLB: "LIEO", OPO: "LPPR", ORD: "KORD", OSL: "ENGM", PFO: "LCPH", PHL: "KPHL", PHX: "KPHX", PIT: "KPIT", PLS: "MBPV", PMI: "LEPA", POS: "TTPP", PRG: "LKPR", PSA: "LIRP", PUJ: "MDPC", PVG: "ZSPD", PVK: "LGPZ", RAK: "GMMX", RBA: "GMME", RHO: "LGRP", RTM: "EHRD", RVN: "EFRO", SAN: "KSAN", SEA: "KSEA", SEZ: "FSIA", SFO: "KSFO", SIN: "WSSS", SJO: "MROC", SKB: "TKPK", SKG: "LGTS", SOF: "LBSF", SPU: "LDSP", SSH: "HESH", STL: "KSTL", SVQ: "LEZL", SZG: "LOWS", TFS: "GCTS", TIA: "LATI", TIV: "LYTV", TLN: "LFTH", TLS: "LFBO", TLV: "LLBG", TPA: "KTPA", TRN: "LIMF", UVF: "TLPL", VCE: "LIPZ", VIE: "LOWW", VRN: "LIPX", WAW: "EPWA", YUL: "CYUL", YVR: "CYVR", YYZ: "CYYZ", ZAG: "LDZA", ZNZ: "HTZA", ZRH: "LSZH", ZTH: "LGZA",
};

// Heathrow reference services add stations that were not part of the original
// BAV hub catalogue. Keep this separate from the baseline so the timetable
// import's dispatch coverage remains easy to audit.
const heathrowAdditionalIcaoByIata: Record<string, string> = {
  ARN: "ESSA", CGN: "EDDK", CVG: "KCVG", FSC: "LFKF", GIB: "LXGB", GOT: "ESGG",
  GRU: "SBGR", JMK: "LGMK", KRK: "EPKK", LJU: "LJLJ", NAS: "MYNN", OTP: "LROP",
  PDL: "LPPD", PEG: "LIRZ", PMO: "LICJ", RIX: "EVRA", RMI: "LIPR", SAW: "LTFJ",
  STR: "EDDS", TBS: "UGTB", VLC: "LEVC",
};

export const BAV_NETWORK_ICAO_BY_IATA: Record<string, string> = {
  ...BAV_NETWORK_ICAO_BASE_BY_IATA,
  ...heathrowAdditionalIcaoByIata,
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

/**
 * The supplied Gatwick timetable covers 1 January through 4 October 2026.
 * The original 1,804 LGW departure rows are represented as exact weekly
 * spans: a service is offered only when the source workbook lists it, while
 * keeping the route catalogue compact enough for Operations to maintain.
 * Times are the published local airport times from the supplied schedule.
 */
const GATWICK_TIMETABLE_VALIDATED_AT = "2026-10-04";

const gatwickSourceUrls = {
  AGA: "https://info.flightmapper.net/route/British_Airways_BA_LGW_AGA",
  AGP: "https://info.flightmapper.net/route/British_Airways_BA_LGW_AGP",
  ALC: "https://info.flightmapper.net/route/British_Airways_BA_LGW_ALC",
  AYT: "https://info.flightmapper.net/route/British_Airways_BA_LGW_AYT",
  BRI: "https://info.flightmapper.net/route/British_Airways_BA_LGW_BRI",
  CAG: "https://info.flightmapper.net/route/British_Airways_BA_LGW_CAG",
  DBV: "https://info.flightmapper.net/route/British_Airways_BA_LGW_DBV",
  DLM: "https://info.flightmapper.net/route/British_Airways_BA_LGW_DLM",
  GRZ: "https://info.flightmapper.net/route/British_Airways_BA_LGW_GRZ",
  IBZ: "https://info.flightmapper.net/route/British_Airways_BA_LGW_IBZ",
  MCO: "https://info.flightmapper.net/flight/British_Airways_BA_2037",
  MLA: "https://info.flightmapper.net/route/British_Airways_BA_LGW_MLA",
  RBA: "https://info.flightmapper.net/route/British_Airways_BA_LGW_RBA",
} as const;

const gatwickAircraftNames = {
  A320: "Airbus A320",
  A321: "Airbus A321",
  B777: "Boeing 777",
} as const;

// Source times are airport-local; these are display block-time references.
const gatwickBlockTimes: Record<keyof typeof gatwickSourceUrls, string> = {
  AGA: "3h 50m", AGP: "2h 50m", ALC: "2h 40m", AYT: "4h 20m",
  BRI: "2h 45m", CAG: "2h 40m", DBV: "2h 35m", DLM: "4h 10m",
  GRZ: "2h 15m", IBZ: "2h 40m", MCO: "9h 40m", MLA: "3h 20m", RBA: "3h 10m",
};

// These ICAO identifiers are transcribed from the supplied schedule rather
// than inferred from their IATA flight numbers.
const gatwickObservedCallsigns = {
  BA2037: "BAW2037", BA2602: "BAW2602", BA2604: "BAW2604", BA2606: "BAW2606",
  BA2608: "BAW2608", BA2614: "BAW2614", BA2640: "BAW2640", BA2654: "BAW2654",
  BA2656: "BAW2656", BA2680: "BAW2680", BA2720: "BAW2720", BA2790: "BAW2790",
  BA2794: "BAW2794", BA2808: "BAW2808", BA2820: "BAW2820", BA2864: "BAW2864",
} as const;

type GatwickTimetableSpan = readonly [
  flightNumber: keyof typeof gatwickObservedCallsigns,
  to: keyof typeof gatwickSourceUrls,
  departure: string,
  arrival: string,
  aircraft: keyof typeof gatwickAircraftNames,
  validFrom: string,
  validUntil: string,
  operatingDay: number,
];

const gatwickTimetableSpans: readonly GatwickTimetableSpan[] = [
  ["BA2037", "MCO", "11:20", "16:10", "B777", "2026-01-01", "2026-03-05", 4],
  ["BA2654", "ALC", "06:45", "10:20", "A320", "2026-01-01", "2026-03-26", 4],
  ["BA2808", "AGA", "07:15", "12:05", "A320", "2026-01-01", "2026-01-08", 4],
  ["BA2037", "MCO", "11:20", "16:10", "B777", "2026-01-02", "2026-03-06", 5],
  ["BA2640", "AGP", "06:15", "10:15", "A321", "2026-01-02", "2026-03-27", 5],
  ["BA2864", "GRZ", "12:20", "15:40", "A320", "2026-01-02", "2026-01-02", 5],
  ["BA2037", "MCO", "11:20", "16:10", "B777", "2026-01-03", "2026-03-07", 6],
  ["BA2808", "AGA", "12:55", "17:35", "A320", "2026-01-03", "2026-01-31", 6],
  ["BA2037", "MCO", "11:20", "16:10", "B777", "2026-01-04", "2026-03-01", 0],
  ["BA2820", "RBA", "07:10", "11:25", "A320", "2026-01-04", "2026-03-22", 0],
  ["BA2037", "MCO", "11:20", "16:10", "B777", "2026-01-05", "2026-03-02", 1],
  ["BA2864", "GRZ", "08:10", "11:30", "A320", "2026-01-05", "2026-03-23", 1],
  ["BA2037", "MCO", "11:20", "16:10", "B777", "2026-01-06", "2026-03-03", 2],
  ["BA2808", "AGA", "07:45", "12:30", "A320", "2026-01-06", "2026-03-24", 2],
  ["BA2037", "MCO", "11:20", "16:10", "B777", "2026-01-07", "2026-03-04", 3],
  ["BA2820", "RBA", "07:50", "12:05", "A320", "2026-01-07", "2026-03-25", 3],
  ["BA2864", "GRZ", "07:25", "10:45", "A320", "2026-01-07", "2026-03-25", 3],
  ["BA2864", "GRZ", "12:50", "16:10", "A320", "2026-01-09", "2026-03-27", 5],
  ["BA2656", "ALC", "15:45", "19:15", "A321", "2026-02-01", "2026-03-22", 0],
  ["BA2808", "AGA", "07:15", "12:05", "A320", "2026-02-12", "2026-03-26", 4],
  ["BA2808", "AGA", "12:55", "17:35", "A320", "2026-02-14", "2026-03-28", 6],
  ["BA2037", "MCO", "11:20", "17:10", "B777", "2026-03-08", "2026-03-22", 0],
  ["BA2037", "MCO", "11:20", "17:10", "B777", "2026-03-09", "2026-03-23", 1],
  ["BA2037", "MCO", "11:20", "17:10", "B777", "2026-03-10", "2026-03-24", 2],
  ["BA2037", "MCO", "11:20", "17:10", "B777", "2026-03-11", "2026-03-25", 3],
  ["BA2037", "MCO", "11:20", "17:10", "B777", "2026-03-12", "2026-03-26", 4],
  ["BA2037", "MCO", "11:20", "17:10", "B777", "2026-03-13", "2026-03-27", 5],
  ["BA2037", "MCO", "11:20", "17:10", "B777", "2026-03-14", "2026-03-28", 6],
  ["BA2037", "MCO", "10:45", "15:15", "B777", "2026-03-29", "2026-10-04", 0],
  ["BA2602", "BRI", "06:45", "10:40", "A320", "2026-03-29", "2026-10-04", 0],
  ["BA2656", "ALC", "15:45", "19:20", "A320", "2026-03-29", "2026-10-04", 0],
  ["BA2680", "IBZ", "08:00", "11:40", "A320", "2026-03-29", "2026-10-04", 0],
  ["BA2808", "AGA", "08:00", "11:50", "A320", "2026-03-29", "2026-10-04", 0],
  ["BA2820", "RBA", "07:25", "10:45", "A320", "2026-03-29", "2026-10-04", 0],
  ["BA2037", "MCO", "10:45", "15:15", "B777", "2026-03-30", "2026-09-28", 1],
  ["BA2614", "MLA", "06:10", "10:30", "A320", "2026-03-30", "2026-09-28", 1],
  ["BA2640", "AGP", "06:10", "10:10", "A320", "2026-03-30", "2026-09-28", 1],
  ["BA2654", "ALC", "06:35", "10:15", "A320", "2026-03-30", "2026-09-28", 1],
  ["BA2680", "IBZ", "08:50", "12:40", "A320", "2026-03-30", "2026-09-28", 1],
  ["BA2720", "DBV", "07:10", "10:55", "A320", "2026-03-30", "2026-09-28", 1],
  ["BA2864", "GRZ", "17:10", "20:20", "A320", "2026-03-30", "2026-09-28", 1],
  ["BA2037", "MCO", "10:45", "15:15", "B777", "2026-03-31", "2026-09-29", 2],
  ["BA2602", "BRI", "07:40", "11:30", "A320", "2026-03-31", "2026-09-29", 2],
  ["BA2654", "ALC", "06:25", "10:05", "A320", "2026-03-31", "2026-09-29", 2],
  ["BA2037", "MCO", "10:45", "15:15", "B777", "2026-04-01", "2026-09-30", 3],
  ["BA2602", "BRI", "07:25", "11:20", "A320", "2026-04-01", "2026-09-30", 3],
  ["BA2614", "MLA", "06:40", "11:00", "A320", "2026-04-01", "2026-09-30", 3],
  ["BA2654", "ALC", "06:40", "10:20", "A320", "2026-04-01", "2026-09-30", 3],
  ["BA2656", "ALC", "17:05", "20:40", "A320", "2026-04-01", "2026-09-30", 3],
  ["BA2808", "AGA", "07:35", "11:25", "A320", "2026-04-01", "2026-09-30", 3],
  ["BA2820", "RBA", "14:50", "18:10", "A320", "2026-04-01", "2026-09-30", 3],
  ["BA2864", "GRZ", "07:40", "10:50", "A320", "2026-04-01", "2026-09-30", 3],
  ["BA2037", "MCO", "10:45", "15:15", "B777", "2026-04-02", "2026-10-01", 4],
  ["BA2606", "BRI", "16:10", "20:00", "A320", "2026-04-02", "2026-10-01", 4],
  ["BA2614", "MLA", "06:50", "11:10", "A320", "2026-04-02", "2026-10-01", 4],
  ["BA2654", "ALC", "06:30", "10:10", "A320", "2026-04-02", "2026-10-01", 4],
  ["BA2680", "IBZ", "09:15", "12:55", "A320", "2026-04-02", "2026-10-01", 4],
  ["BA2037", "MCO", "10:45", "15:15", "B777", "2026-04-03", "2026-10-02", 5],
  ["BA2640", "AGP", "06:15", "10:15", "A320", "2026-04-03", "2026-10-02", 5],
  ["BA2656", "ALC", "17:25", "21:00", "A320", "2026-04-03", "2026-10-02", 5],
  ["BA2680", "IBZ", "08:50", "12:30", "A320", "2026-04-03", "2026-10-02", 5],
  ["BA2808", "AGA", "08:25", "12:15", "A320", "2026-04-03", "2026-10-02", 5],
  ["BA2864", "GRZ", "16:00", "19:10", "A320", "2026-04-03", "2026-10-02", 5],
  ["BA2037", "MCO", "10:45", "15:15", "B777", "2026-04-04", "2026-10-03", 6],
  ["BA2614", "MLA", "06:25", "10:45", "A320", "2026-04-04", "2026-10-03", 6],
  ["BA2640", "AGP", "06:40", "10:40", "A320", "2026-04-04", "2026-10-03", 6],
  ["BA2654", "ALC", "06:25", "10:05", "A320", "2026-04-04", "2026-10-03", 6],
  ["BA2656", "ALC", "17:40", "21:15", "A320", "2026-04-04", "2026-10-03", 6],
  ["BA2680", "IBZ", "09:25", "13:05", "A320", "2026-04-04", "2026-10-03", 6],
  ["BA2794", "AYT", "13:10", "19:55", "A320", "2026-04-30", "2026-10-01", 4],
  ["BA2790", "DLM", "08:05", "14:15", "A320", "2026-05-01", "2026-10-02", 5],
  ["BA2790", "DLM", "06:15", "12:25", "A320", "2026-05-03", "2026-10-04", 0],
  ["BA2794", "AYT", "08:25", "15:05", "A320", "2026-05-03", "2026-10-04", 0],
  ["BA2794", "AYT", "10:50", "17:35", "A320", "2026-05-05", "2026-09-29", 2],
  ["BA2790", "DLM", "06:15", "12:25", "A320", "2026-05-06", "2026-09-30", 3],
  ["BA2604", "CAG", "07:10", "10:50", "A320", "2026-05-21", "2026-10-01", 4],
  ["BA2790", "DLM", "06:25", "12:35", "A320", "2026-05-21", "2026-10-01", 4],
  ["BA2608", "CAG", "16:00", "19:35", "A320", "2026-05-22", "2026-10-02", 5],
  ["BA2604", "CAG", "07:10", "10:50", "A320", "2026-05-23", "2026-10-03", 6],
  ["BA2720", "DBV", "06:45", "10:30", "A320", "2026-05-23", "2026-10-03", 6],
  ["BA2790", "DLM", "13:40", "19:45", "A320", "2026-05-23", "2026-10-03", 6],
  ["BA2604", "CAG", "08:50", "12:30", "A320", "2026-05-24", "2026-09-27", 0],
  ["BA2720", "DBV", "06:20", "10:10", "A320", "2026-05-24", "2026-10-04", 0],
  ["BA2602", "BRI", "07:20", "11:15", "A320", "2026-05-25", "2026-09-28", 1],
  ["BA2606", "BRI", "16:55", "20:45", "A320", "2026-05-25", "2026-09-28", 1],
  ["BA2608", "CAG", "15:35", "19:10", "A320", "2026-05-25", "2026-09-28", 1],
  ["BA2604", "CAG", "10:25", "14:05", "A320", "2026-05-26", "2026-09-29", 2],
  ["BA2606", "BRI", "16:35", "20:25", "A320", "2026-05-26", "2026-09-29", 2],
  ["BA2680", "IBZ", "07:35", "11:15", "A320", "2026-05-26", "2026-09-29", 2],
  ["BA2720", "DBV", "07:00", "10:35", "A320", "2026-05-26", "2026-09-29", 2],
  ["BA2608", "CAG", "15:45", "19:20", "A320", "2026-05-27", "2026-09-30", 3],
  ["BA2794", "AYT", "06:40", "13:20", "A320", "2026-05-27", "2026-09-30", 3],
  ["BA2604", "CAG", "06:10", "09:50", "A320", "2026-06-29", "2026-08-31", 1],
];

function gatwickServiceFromSpan([
  flightNumber,
  to,
  departure,
  arrival,
  aircraft,
  validFrom,
  validUntil,
  operatingDay,
]: GatwickTimetableSpan, referenceOnly = false): BavNetworkRouteSeed {
  return {
  id: `ba-gatwick-${referenceOnly ? "reference" : "2026"}-${flightNumber.toLowerCase()}-${to.toLowerCase()}-${validFrom.replaceAll("-", "")}-${departure.replace(":", "")}`,
  from: "LGW",
  to,
  flightNumber,
  callsign: gatwickObservedCallsigns[flightNumber],
  departure,
  arrival,
  duration: gatwickBlockTimes[to],
  aircraft: gatwickAircraftNames[aircraft],
  aircraftOptions: [gatwickAircraftNames[aircraft]],
  slots: 12,
  active: true,
  ...(referenceOnly ? { referenceOnly: true } : { validFrom, validUntil, operatingDays: [operatingDay] }),
  sourceUrl: gatwickSourceUrls[to],
  validatedAt: GATWICK_TIMETABLE_VALIDATED_AT,
  };
}

const gatwickTimetableServices: BavNetworkRouteSeed[] = gatwickTimetableSpans.map((span) => gatwickServiceFromSpan(span));

// A selected simulator date can sit just beyond the supplied timetable
// window. Keep the latest checked service for each Gatwick flight bookable as
// a clearly labelled operational reference instead of hiding the route.
const latestGatwickReferenceSpans = new Map<keyof typeof gatwickObservedCallsigns, GatwickTimetableSpan>();
for (const span of gatwickTimetableSpans) {
  const existing = latestGatwickReferenceSpans.get(span[0]);
  if (!existing || span[6] > existing[6]) latestGatwickReferenceSpans.set(span[0], span);
}
const gatwickReferenceServices: BavNetworkRouteSeed[] = [...latestGatwickReferenceSpans.values()]
  .map((span) => gatwickServiceFromSpan(span, true));

type GatwickReturnReference = {
  from: keyof typeof gatwickSourceUrls;
  flightNumber: string;
  departure: string;
  arrival: string;
  duration: string;
  aircraft: keyof typeof gatwickAircraftNames;
  sourceUrl: string;
};

/**
 * Every sourced LGW departure needs a way back to Gatwick. The supplied
 * workbook contains only LGW-originating rows, so these are deliberately
 * reference services: each pairing, BA flight number and BAW ICAO callsign
 * has been independently checked, but is not claimed to be a date-specific
 * timetable entry until Operations has the corresponding inbound schedule.
 */
const gatwickReturnReferences = {
  BA2037: {
    from: "MCO", flightNumber: "BA2036", departure: "17:15", arrival: "06:50", duration: "8h 35m", aircraft: "B777",
    sourceUrl: "https://www.flightaware.com/live/flight/BAW2036/history",
  },
  BA2602: {
    from: "BRI", flightNumber: "BA2603", departure: "12:00", arrival: "14:05", duration: "3h 05m", aircraft: "A321",
    sourceUrl: "https://www.flight.info/BA2603",
  },
  BA2604: {
    from: "CAG", flightNumber: "BA2605", departure: "14:00", arrival: "15:50", duration: "2h 50m", aircraft: "A320",
    sourceUrl: "https://www.flight.info/BA2605",
  },
  BA2606: {
    from: "BRI", flightNumber: "BA2607", departure: "18:20", arrival: "20:25", duration: "3h 05m", aircraft: "A321",
    sourceUrl: "https://www.flightstats.com/v2/flight-details/BA/2607",
  },
  BA2608: {
    from: "CAG", flightNumber: "BA2609", departure: "20:00", arrival: "21:45", duration: "2h 45m", aircraft: "A320",
    sourceUrl: "https://info.flightmapper.net/flight/British_Airways_BA_2609",
  },
  BA2614: {
    from: "MLA", flightNumber: "BA2615", departure: "11:25", arrival: "13:40", duration: "3h 15m", aircraft: "A321",
    sourceUrl: "https://www.flight.info/BA2615",
  },
  BA2640: {
    from: "AGP", flightNumber: "BA2641", departure: "12:00", arrival: "13:55", duration: "2h 55m", aircraft: "A320",
    sourceUrl: "https://www.airportia.com/flights/ba2641/malaga/london/",
  },
  BA2654: {
    from: "ALC", flightNumber: "BA2655", departure: "11:10", arrival: "12:50", duration: "2h 40m", aircraft: "A320",
    sourceUrl: "https://info.flightmapper.net/flight/British_Airways_BA_2655",
  },
  BA2656: {
    from: "ALC", flightNumber: "BA2657", departure: "21:35", arrival: "23:20", duration: "2h 45m", aircraft: "A320",
    sourceUrl: "https://www.planemapper.com/flights/BA2657",
  },
  BA2680: {
    from: "IBZ", flightNumber: "BA2681", departure: "12:30", arrival: "13:50", duration: "2h 20m", aircraft: "A320",
    sourceUrl: "https://info.flightmapper.net/flight/British_Airways_BA_2681",
  },
  BA2720: {
    from: "DBV", flightNumber: "BA2721", departure: "11:20", arrival: "13:20", duration: "3h 00m", aircraft: "A320",
    sourceUrl: "https://info.flightmapper.net/flight/British_Airways_BA_2721",
  },
  BA2790: {
    from: "DLM", flightNumber: "BA2791", departure: "16:35", arrival: "19:05", duration: "4h 30m", aircraft: "A320",
    sourceUrl: "https://www.planemapper.com/flights/BA2791",
  },
  BA2794: {
    from: "AYT", flightNumber: "BA2795", departure: "14:20", arrival: "17:05", duration: "4h 45m", aircraft: "A320",
    sourceUrl: "https://info.flightmapper.net/flight/British_Airways_BA_2795",
  },
  BA2808: {
    from: "AGA", flightNumber: "BA2809", departure: "15:00", arrival: "18:40", duration: "3h 40m", aircraft: "A320",
    sourceUrl: "https://www.flight.info/BA2809",
  },
  BA2820: {
    from: "RBA", flightNumber: "BA2821", departure: "19:15", arrival: "22:20", duration: "3h 05m", aircraft: "A320",
    sourceUrl: "https://www.flight.info/BA2821",
  },
  BA2864: {
    from: "GRZ", flightNumber: "BA2865", departure: "11:45", arrival: "13:05", duration: "2h 20m", aircraft: "A320",
    sourceUrl: "https://graz-airport.at/en/london-with-british-airways/",
  },
} as const satisfies Record<keyof typeof gatwickObservedCallsigns, GatwickReturnReference>;

const gatwickReturnReferenceServices: BavNetworkRouteSeed[] = (
  Object.keys(gatwickReturnReferences) as Array<keyof typeof gatwickObservedCallsigns>
).map((outboundFlightNumber) => {
  const returnReference = gatwickReturnReferences[outboundFlightNumber];
  return {
    id: `ba-gatwick-return-reference-${outboundFlightNumber.toLowerCase()}-${returnReference.flightNumber.toLowerCase()}`,
    from: returnReference.from,
    to: "LGW",
    flightNumber: returnReference.flightNumber,
    callsign: `BAW${returnReference.flightNumber.slice(2)}`,
    departure: returnReference.departure,
    arrival: returnReference.arrival,
    duration: returnReference.duration,
    aircraft: gatwickAircraftNames[returnReference.aircraft],
    aircraftOptions: [gatwickAircraftNames[returnReference.aircraft]],
    slots: 12,
    active: true,
    referenceOnly: true,
    sourceUrl: returnReference.sourceUrl,
    validatedAt: GATWICK_TIMETABLE_VALIDATED_AT,
  };
});

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
 * The supplied Heathrow workbook is a route-and-callsign reference, not a
 * dated day-by-day timetable. Preserve all of its commercial BA numbers and
 * BAW/SHT identifiers without pretending that its current timing samples are
 * historic schedule facts. The booking UI already describes reference-only
 * services as flight-simulation planning times.
 */
const HEATHROW_CALLSIGN_REFERENCE_VALIDATED_AT = "2026-10-04";
const HEATHROW_CALLSIGN_REFERENCE_SOURCE = "https://speedbird.online/flightnumbers.php/airport_detail.php?iata=LHR";

function heathrowReferencePlanningValues(from: string, to: string, sequence: number) {
  const otherStation = from === "LHR" ? to : from;
  const duration = durationPartsForVirtualService(otherStation);
  const departureMinutes = 5 * 60 + ((sequence * 43 + (from === "LHR" ? 0 : 23)) % (16 * 60));
  const equipment = virtualAircraft("LHR", otherStation, sequence);
  return {
    departure: toClock(departureMinutes),
    arrival: toClock(departureMinutes + duration.hours * 60 + duration.minutes),
    duration: `${duration.hours}h ${String(duration.minutes).padStart(2, "0")}m`,
    aircraft: equipment.aircraft,
    aircraftOptions: equipment.aircraftOptions,
  };
}

const detailedReferenceKeys = new Set(
  verifiedSchedules
    .filter((route) => route.referenceOnly)
    .map((route) => `${route.flightNumber}-${route.from}-${route.to}`),
);

const heathrowCallsignReferenceServices: BavNetworkRouteSeed[] = heathrowCallsignReferences
  .filter((reference) => !detailedReferenceKeys.has(`${reference.flightNumber}-${reference.from}-${reference.to}`))
  .map((reference, sequence) => ({
    id: `ba-heathrow-reference-${reference.flightNumber.toLowerCase()}-${reference.from.toLowerCase()}-${reference.to.toLowerCase()}`,
    from: reference.from,
    to: reference.to,
    flightNumber: reference.flightNumber,
    callsign: reference.callsign,
    ...heathrowReferencePlanningValues(reference.from, reference.to, sequence),
    slots: 12,
    active: true,
    referenceOnly: true,
    sourceUrl: HEATHROW_CALLSIGN_REFERENCE_SOURCE,
    validatedAt: HEATHROW_CALLSIGN_REFERENCE_VALIDATED_AT,
  }));

/**
 * The persistent route store migrates this complete set as one baseline. The
 * number of records is greater than 221 because several published airport
 * pairs have multiple independently verified departures.
 */
export const BAV_NETWORK_2026: BavNetworkRouteSeed[] = [
  ...virtualOperationalRoutes,
  ...gatwickTimetableServices,
  ...gatwickReferenceServices,
  ...gatwickReturnReferenceServices,
  ...verifiedSchedules,
  ...heathrowCallsignReferenceServices,
];
