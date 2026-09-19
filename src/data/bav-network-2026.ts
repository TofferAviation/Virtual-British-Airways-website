/**
 * Verified British Airways schedule records used by BAV.
 *
 * This catalogue must never manufacture a flight number, departure time or
 * aircraft from a destination list. Each row is a published BA service checked
 * against a dated schedule source. Times are UTC so an OFP and BAV booking use
 * the same clock. Aircraft can still change operationally, so a row records the
 * aircraft scheduled for the checked date plus the BA equipment family seen on
 * the service where appropriate.
 */

export type BavNetworkRouteSeed = {
  id: string;
  from: "LHR" | "LGW" | "LCY";
  to: string;
  flightNumber: string;
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
};

export const BAV_NETWORK_VALIDATED_AT = "2026-09-19";
export const BAV_NETWORK_SCHEDULE_VERSION = "ba-summer-2026-verified-2026-09-19";

export const BAV_NETWORK_SOURCES = [
  "https://www.britishairways.com/content/flights/from-london-heathrow",
  "https://www.britishairways.com/content/flights/from-london-gatwick",
  "https://www.britishairways.com/londoncity",
  "https://www.britishairways.com/content/information/flight-information/our-route-network",
  "https://mediacentre.britishairways.com/news/21112025/british-airways-expands-its-heathrow-network-with-two-new-short-haul-destinations-for-summer-2026",
  "https://mediacentre.britishairways.com/news/16032026/british-airways-announces-major-winter-2026-expansion-1",
] as const;

// SimBrief needs ICAO, not IATA. Keeping the mapping next to the validated
// network means every published BAV route can open a dispatch without a
// second, incomplete airport list.
export const BAV_NETWORK_ICAO_BY_IATA: Record<string, string> = {
  ABZ: "EGPD", ACC: "DGAA", ACE: "GCRR", AGA: "GMAD", AGP: "LEMG", ALC: "LEAL", ALG: "DAAG", AMM: "OJAI", AMS: "EHAM", ANU: "TAPA", ATH: "LGAV", ATL: "KATL", AUH: "OMAA", AUS: "KAUS", AYT: "LTAI", BAH: "OBBI", BCN: "LEBL", BDS: "LIBR", BER: "EDDB", BGI: "TBPB", BHD: "EGAC", BKK: "VTBS", BLL: "EKBI", BLQ: "LIPE", BLR: "VOBL", BNA: "KBNA", BOD: "LFBD", BOM: "VABB", BOS: "KBOS", BRI: "LIBD", BRU: "EBBR", BUD: "LHBP", BWI: "KBWI", CAG: "LIEE", CAI: "HECA", CFU: "LGKR", CHQ: "LGSA", CMB: "VCBI", CMF: "LFLB", CPH: "EKCH", CPT: "FACT", CTA: "LICC", CUN: "MMUN", DBV: "LDDU", DEL: "VIDP", DEN: "KDEN", DFW: "KDFW", DLM: "LTBS", DOH: "OTHH", DUB: "EIDW", DUS: "EDDL", DXB: "OMDB", EAS: "LESO", EDI: "EGPH", EFL: "LGKF", EGC: "LFBE", EZE: "SAEZ", FAO: "LPFR", FCO: "LIRF", FLR: "LIRQ", FNC: "LPMA", FRA: "EDDF", FUE: "GCFV", GCI: "EGJB", GLA: "EGPF", GNB: "LFLS", GND: "TGPY", GRZ: "LOWG", GVA: "LSGG", HAJ: "EDDV", HAM: "EDDH", HER: "LGIR", HKG: "VHHH", HND: "RJTT", HYD: "VOHS", IAD: "KIAD", IAH: "KIAH", IBZ: "LEIB", INN: "LOWI", INV: "EGPE", ISB: "OPIS", IST: "LTFM", IVL: "EFIV", JER: "EGJJ", JFK: "KJFK", JNB: "FAOR", JRO: "HTKJ", JSI: "LGSK", JTR: "LGSR", KEF: "BIKF", KGS: "LGKO", KIN: "MKJP", KLX: "LGKL", KUL: "WMKK", KWI: "OKBK", LAS: "KLAS", LAX: "KLAX", LCA: "LCLK", LIN: "LIML", LIS: "LPPT", LOS: "DNMM", LPA: "GCLP", LUX: "ELLX", LYS: "LFLL", MAA: "VOMM", MAD: "LEMD", MAH: "LEMH", MAN: "EGCC", MCO: "KMCO", MCT: "OOMS", MEX: "MMMX", MIA: "KMIA", MLA: "LMML", MPL: "LFMT", MRS: "LFML", MRU: "FIMP", MSY: "KMSY", MUC: "EDDM", NAP: "LIRN", NBO: "HKJK", NCE: "LFMN", NCL: "EGNT", OLB: "LIEO", OPO: "LPPR", ORD: "KORD", OSL: "ENGM", PFO: "LCPH", PHL: "KPHL", PHX: "KPHX", PIT: "KPIT", PLS: "MBPV", PMI: "LEPA", POS: "TTPP", PRG: "LKPR", PSA: "LIRP", PUJ: "MDPC", PVG: "ZSPD", PVK: "LGPZ", RAK: "GMMX", RBA: "GMME", RHO: "LGRP", RTM: "EHRD", RVN: "EFRO", SAN: "KSAN", SEA: "KSEA", SEZ: "FSIA", SFO: "KSFO", SIN: "WSSS", SJO: "MROC", SKB: "TKPK", SKG: "LGTS", SOF: "LBSF", SPU: "LDSP", SSH: "HESH", STL: "KSTL", SVQ: "LEZL", SZG: "LOWS", TFS: "GCTS", TIA: "LATI", TIV: "LYTV", TLN: "LFTH", TLS: "LFBO", TLV: "LLBG", TPA: "KTPA", TRN: "LIMF", UVF: "TLPL", VCE: "LIPZ", VIE: "LOWW", VRN: "LIPX", WAW: "EPWA", YUL: "CYUL", YVR: "CYVR", YYZ: "CYYZ", ZAG: "LDZA", ZNZ: "HTZA", ZRH: "LSZH", ZTH: "LGZA",
};

const checked = BAV_NETWORK_VALIDATED_AT;
const sources = {
  lux: "https://www.flight.info/BA416",
  jersey: "https://www.flightradar24.com/data/flights/ba1346",
  hannover: "https://www.flight.info/BA894",
  belfastCity: "https://www.flightconnections.com/flights-from-lhr-to-bhd",
  newcastle: "https://www.directflights.com/LHR-NCL",
} as const;

/**
 * The initial audit slice intentionally contains only services for which the
 * actual BA number, operating day, time and aircraft have been checked. The
 * old generated BAVxxxx rows are not carried forward: an incomplete verified
 * catalogue is safer than presenting invented services to pilots.
 */
export const BAV_NETWORK_2026: BavNetworkRouteSeed[] = [
  // Luxembourg and Hannover were missing from the previous generated schedule.
  { id: "ba-s26-lhr-lux-ba416", from: "LHR", to: "LUX", flightNumber: "BA416", departure: "06:05", arrival: "07:25", duration: "1h 20m", aircraft: "Airbus A320", aircraftOptions: ["Airbus A320", "Airbus A319", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-14", validUntil: "2026-10-24", operatingDays: [1, 2, 3, 4, 5, 6], sourceUrl: sources.lux, validatedAt: checked },
  { id: "ba-s26-lhr-jer-ba1346", from: "LHR", to: "JER", flightNumber: "BA1346", departure: "07:40", arrival: "08:40", duration: "1h 00m", aircraft: "Airbus A320", aircraftOptions: ["Airbus A320", "Airbus A319", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-14", validUntil: "2026-10-24", operatingDays: [0, 1, 2, 3, 4, 5, 6], sourceUrl: sources.jersey, validatedAt: checked },
  { id: "ba-s26-lhr-gci-ba1344", from: "LHR", to: "GCI", flightNumber: "BA1344", departure: "10:55", arrival: "11:55", duration: "1h 00m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319"], slots: 12, active: true, validFrom: "2026-04-19", operatingDays: [0, 1, 2, 3, 4, 5, 6], sourceUrl: "https://mediacentre.britishairways.com/news/21112025/british-airways-expands-its-heathrow-network-with-two-new-short-haul-destinations-for-summer-2026", validatedAt: checked },
  { id: "ba-s26-lhr-haj-ba894", from: "LHR", to: "HAJ", flightNumber: "BA894", departure: "17:00", arrival: "18:35", duration: "1h 35m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319", "Airbus A320", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-14", validUntil: "2026-10-24", operatingDays: [0, 1, 2, 3, 4, 5, 6], sourceUrl: sources.hannover, validatedAt: checked },

  // Belfast City: actual Saturday 19 September services, each with its BA number.
  { id: "ba-s26-lhr-bhd-ba1390", from: "LHR", to: "BHD", flightNumber: "BA1390", departure: "06:30", arrival: "07:50", duration: "1h 20m", aircraft: "Airbus A320neo", aircraftOptions: ["Airbus A320neo", "Airbus A319", "Airbus A320"], slots: 12, active: true, validFrom: "2026-09-14", validUntil: "2026-10-24", operatingDays: [0, 1, 2, 3, 4, 5, 6], sourceUrl: sources.belfastCity, validatedAt: checked },
  { id: "ba-s26-lhr-bhd-ba1400", from: "LHR", to: "BHD", flightNumber: "BA1400", departure: "12:05", arrival: "13:30", duration: "1h 25m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319", "Airbus A320", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-19", validUntil: "2026-09-19", operatingDays: [6], sourceUrl: sources.belfastCity, validatedAt: checked },
  { id: "ba-s26-lhr-bhd-ba1402", from: "LHR", to: "BHD", flightNumber: "BA1402", departure: "14:45", arrival: "16:10", duration: "1h 25m", aircraft: "Airbus A320", aircraftOptions: ["Airbus A320", "Airbus A319", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-19", validUntil: "2026-09-19", operatingDays: [6], sourceUrl: sources.belfastCity, validatedAt: checked },
  { id: "ba-s26-lhr-bhd-ba1410", from: "LHR", to: "BHD", flightNumber: "BA1410", departure: "18:20", arrival: "19:35", duration: "1h 15m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319", "Airbus A320", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-14", validUntil: "2026-10-24", operatingDays: [0, 1, 2, 3, 4, 5, 6], sourceUrl: sources.belfastCity, validatedAt: checked },

  // Newcastle has three real departures on the checked Saturday, not one generated route.
  { id: "ba-s26-lhr-ncl-ba1326", from: "LHR", to: "NCL", flightNumber: "BA1326", departure: "07:00", arrival: "08:10", duration: "1h 10m", aircraft: "Airbus A320neo", aircraftOptions: ["Airbus A320neo", "Airbus A319", "Airbus A320", "Airbus A321neo"], slots: 12, active: true, validFrom: "2026-09-19", validUntil: "2026-09-19", operatingDays: [6], sourceUrl: sources.newcastle, validatedAt: checked },
  { id: "ba-s26-lhr-ncl-ba1338", from: "LHR", to: "NCL", flightNumber: "BA1338", departure: "17:25", arrival: "18:35", duration: "1h 10m", aircraft: "Airbus A320neo", aircraftOptions: ["Airbus A320neo", "Airbus A319", "Airbus A320", "Airbus A321neo"], slots: 12, active: true, validFrom: "2026-09-19", validUntil: "2026-09-19", operatingDays: [6], sourceUrl: sources.newcastle, validatedAt: checked },
  { id: "ba-s26-lhr-ncl-ba1340", from: "LHR", to: "NCL", flightNumber: "BA1340", departure: "19:50", arrival: "20:55", duration: "1h 05m", aircraft: "Airbus A319", aircraftOptions: ["Airbus A319", "Airbus A320", "Airbus A320neo"], slots: 12, active: true, validFrom: "2026-09-19", validUntil: "2026-09-19", operatingDays: [6], sourceUrl: sources.newcastle, validatedAt: checked },
];
