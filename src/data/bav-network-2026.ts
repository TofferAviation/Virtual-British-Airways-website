/**
 * British Airways London-hub network data used by BAV.
 *
 * City-pair availability and a detailed operating timetable are deliberately
 * separate. A route is useful to pilots as soon as BA publishes the city pair;
 * a BA flight number, local airport time and aircraft are shown only after that individual
 * service has been verified. This prevents a broad route map from accidentally
 * presenting guessed operational details as fact.
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
  /** A published city pair without a verified individual BA timetable yet. */
  catalogueOnly?: boolean;
};

export const BAV_NETWORK_VALIDATED_AT = "2026-09-19";
export const BAV_NETWORK_SCHEDULE_VERSION = "ba-london-hubs-route-catalogue-2026-09-19";

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
 * airport-pair records, not generated BA timetables: 144 Heathrow, 53
 * Gatwick and 24 City routes. It is deliberately kept separate from the
 * detailed service records below so a city pair never gains a made-up BA
 * flight number, time or equipment assignment.
 */
const destinationsByHub = {
  LHR: [
    "ABZ", "ACC", "AGP", "ALG", "AMM", "AMS", "ATH", "ATL", "AUH", "AUS", "BAH", "BCN", "BHD", "BKK", "BLR", "BNA", "BOD", "BOM", "BOS", "BRU", "BUD", "BWI", "CAI", "CPT", "CPH", "DEL", "DEN", "DFW", "DOH", "DUB", "DUS", "DXB", "EDI", "EZE", "FAO", "FCO", "FRA", "GCI", "GLA", "GVA", "HAM", "HKG", "HND", "HYD", "IAH", "IAD", "INV", "ISB", "IST", "JFK", "JNB", "JTR", "KEF", "KUL", "KWI", "LAS", "LAX", "LIS", "LOS", "LYS", "MAD", "MAN", "MAA", "MCT", "MEX", "MIA", "MLA", "MRS", "MSY", "MUC", "NAP", "NBO", "NCE", "NCL", "ORD", "OSL", "PHL", "PHX", "PIT", "PRG", "PVG", "SAN", "SEA", "SEZ", "SFO", "SIN", "SJO", "SOF", "SPU", "STL", "TLS", "TIV", "TLV", "TPA", "VCE", "VIE", "WAW", "YUL", "YVR", "YYZ", "ZRH", "ALC", "AYT", "BDS", "BLL", "BLQ", "BRI", "CAG", "CFU", "CHQ", "CTA", "DBV", "EFL", "FLR", "FNC", "HER", "IBZ", "INN", "KGS", "KLX", "LCA", "LIN", "MAH", "PMI", "PFO", "PSA", "PVK", "RHO", "SKG", "SZG", "TFS", "TIA", "VRN", "ZAG", "ZTH",
    "ABV", "BDA", "CDG", "EWR", "HAJ", "JER", "LUX", "MXP", "NUE",
  ],
  LGW: [
    "ACE", "ALC", "ANU", "BGI", "BOD", "CMB", "CFU", "CHQ", "CUN", "DBV", "FNC", "GNB", "GND", "GRZ", "HER", "IBZ", "INN", "IVL", "JER", "JRO", "KGS", "KIN", "KLX", "LCA", "LPA", "LYS", "MAH", "MLA", "MCO", "MPL", "MRU", "NCE", "PFO", "PLS", "PMI", "POS", "PUJ", "RAK", "RHO", "RVN", "SKB", "SKG", "SSH", "SVQ", "SZG", "TFS", "TPA", "TRN", "UVF", "VRN", "ZNZ", "AGP", "FUE",
  ],
  LCY: [
    "AMS", "BCN", "BHD", "BER", "CMF", "DUB", "EDI", "EAS", "EGC", "FAO", "FLR", "GLA", "GVA", "IBZ", "JSI", "LIN", "NCE", "OLB", "PMI", "PRG", "RTM", "SPU", "TLN", "ZRH",
  ],
} as const;

export const BAV_NETWORK_ROUTE_COUNTS = {
  LHR: destinationsByHub.LHR.length,
  LGW: destinationsByHub.LGW.length,
  LCY: destinationsByHub.LCY.length,
  total: destinationsByHub.LHR.length + destinationsByHub.LGW.length + destinationsByHub.LCY.length,
} as const;

const routeNetworkSource = "https://www.britishairways.com/content/information/flight-information/our-route-network";

const catalogueRoutes: BavNetworkRouteSeed[] = (Object.keys(destinationsByHub) as Array<BavNetworkRouteSeed["from"]>).flatMap((from) =>
  destinationsByHub[from].map((to) => ({
    id: `bav-network-2026-${from.toLowerCase()}-${to.toLowerCase()}`,
    from,
    to,
    flightNumber: "BA route",
    departure: "TBD",
    arrival: "TBD",
    duration: "Timetable pending",
    aircraft: "Aircraft to be scheduled",
    slots: 0,
    active: true,
    catalogueOnly: true,
    sourceUrl: routeNetworkSource,
    validatedAt: BAV_NETWORK_VALIDATED_AT,
  })),
);

const checked = BAV_NETWORK_VALIDATED_AT;
const sources = {
  lux: "https://www.flight.info/BA416",
  jersey: "https://www.flightradar24.com/data/flights/ba1346",
  hannover: "https://www.flight.info/BA894",
  belfastCity: "https://www.flightconnections.com/flights-from-lhr-to-bhd",
  newcastle: "https://www.directflights.com/LHR-NCL",
} as const;

/**
 * Detailed services independently checked against a dated public schedule.
 * More can be added through the Staff Centre route editor as they are audited.
 */
const verifiedSchedules: BavNetworkRouteSeed[] = [
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

/**
 * The persistent route store migrates this complete set as one baseline. The
 * number of records is greater than 221 because several published airport
 * pairs have multiple independently verified departures.
 */
export const BAV_NETWORK_2026: BavNetworkRouteSeed[] = [
  ...catalogueRoutes,
  ...verifiedSchedules,
];
