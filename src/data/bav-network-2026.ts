/**
 * British Airways Virtual's current network baseline.
 *
 * The city pairs were validated on 18 September 2026 against British Airways'
 * public "Flights from London Heathrow", "Flights from London Gatwick" and
 * "Flights from London City" network pages, plus BA's 2026 network releases.
 * These are BAV services: the BAV identifiers and UTC dispatch windows below
 * are intentionally our own operational settings, not a copied BA timetable.
 * Operations may change, suspend or add services in Staff Centre at any time.
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
  /** JavaScript weekday numbers (Sunday = 0) for an explicitly published frequency. */
  operatingDays?: number[];
};

export const BAV_NETWORK_VALIDATED_AT = "2026-09-18";

export const BAV_NETWORK_SOURCES = [
  "https://www.britishairways.com/content/flights/from-london-heathrow",
  "https://www.britishairways.com/content/flights/from-london-gatwick",
  "https://www.britishairways.com/londoncity",
  "https://mediacentre.britishairways.com/news/21112025/british-airways-expands-its-heathrow-network-with-two-new-short-haul-destinations-for-summer-2026",
  "https://mediacentre.britishairways.com/news/16032026/british-airways-announces-major-winter-2026-expansion-1",
] as const;

// Direct destinations published by BA for each BAV London hub. The source
// lists can change by season; this baseline is deliberately staff-editable.
const destinationsByHub = {
  LHR: [
    "ABZ", "ACC", "AGP", "ALG", "AMM", "AMS", "ATH", "ATL", "AUH", "AUS", "BAH", "BCN", "BHD", "BKK", "BLR", "BNA", "BOD", "BOM", "BOS", "BRU", "BUD", "BWI", "CAI", "CPT", "CPH", "DEL", "DEN", "DFW", "DOH", "DUB", "DUS", "DXB", "EDI", "EZE", "FAO", "FCO", "FRA", "GCI", "GLA", "GVA", "HAM", "HKG", "HND", "HYD", "IAH", "IAD", "INV", "ISB", "IST", "JFK", "JNB", "JTR", "KEF", "KUL", "KWI", "LAS", "LAX", "LIS", "LOS", "LYS", "MAD", "MAN", "MAA", "MCT", "MEX", "MIA", "MLA", "MRS", "MSY", "MUC", "NAP", "NBO", "NCE", "NCL", "ORD", "OSL", "PHL", "PHX", "PIT", "PRG", "PVG", "SAN", "SEA", "SEZ", "SFO", "SIN", "SJO", "SOF", "SPU", "STL", "TLS", "TIV", "TLV", "TPA", "VCE", "VIE", "WAW", "YUL", "YVR", "YYZ", "ZRH",
    "ALC", "AYT", "BDS", "BLL", "BLQ", "BOD", "BRI", "CAG", "CFU", "CHQ", "CTA", "DBV", "EFL", "FLR", "FNC", "HER", "IBZ", "INN", "KGS", "KLX", "LCA", "LIN", "MAH", "PMI", "PFO", "PSA", "PVK", "RHO", "SKG", "SZG", "TFS", "TIA", "VRN", "ZAG", "ZTH",
  ],
  LGW: [
    "ACE", "AGA", "AGP", "ALC", "ALG", "ANU", "AYT", "BGI", "BOD", "BRI", "CMB", "CFU", "CHQ", "CPT", "CTA", "CUN", "DBV", "DLM", "DOH", "FAO", "FNC", "FUE", "GLA", "GNB", "GND", "GRZ", "HER", "IBZ", "INN", "IVL", "JER", "JRO", "KGS", "KIN", "KLX", "LCA", "LPA", "LYS", "MAH", "MLA", "MCO", "MPL", "MRU", "NCE", "OLB", "OPO", "PFO", "PLS", "PMI", "POS", "PUJ", "RAK", "RBA", "RHO", "RVN", "SKB", "SKG", "SSH", "SVQ", "SZG", "TFS", "TPA", "TRN", "UVF", "VRN", "ZNZ",
  ],
  LCY: [
    "AMS", "BCN", "BHD", "BER", "CMF", "DUB", "EDI", "EAS", "EGC", "FAO", "FLR", "GLA", "GVA", "IBZ", "JSI", "LIN", "NCE", "OLB", "PMI", "PRG", "RTM", "SPU", "TLN", "ZRH",
  ],
} as const;

// SimBrief needs ICAO, not IATA. Keeping the mapping next to the validated
// network means every published BAV route can open a dispatch without a
// second, incomplete airport list.
export const BAV_NETWORK_ICAO_BY_IATA: Record<string, string> = {
  ABZ: "EGPD", ACC: "DGAA", ACE: "GCRR", AGA: "GMAD", AGP: "LEMG", ALC: "LEAL", ALG: "DAAG", AMM: "OJAI", AMS: "EHAM", ANU: "TAPA", ATH: "LGAV", ATL: "KATL", AUH: "OMAA", AUS: "KAUS", AYT: "LTAI", BAH: "OBBI", BCN: "LEBL", BDS: "LIBR", BER: "EDDB", BGI: "TBPB", BHD: "EGAC", BKK: "VTBS", BLL: "EKBI", BLQ: "LIPE", BLR: "VOBL", BNA: "KBNA", BOD: "LFBD", BOM: "VABB", BOS: "KBOS", BRI: "LIBD", BRU: "EBBR", BUD: "LHBP", BWI: "KBWI", CAG: "LIEE", CAI: "HECA", CFU: "LGKR", CHQ: "LGSA", CMB: "VCBI", CMF: "LFLB", CPH: "EKCH", CPT: "FACT", CTA: "LICC", CUN: "MMUN", DBV: "LDDU", DEL: "VIDP", DEN: "KDEN", DFW: "KDFW", DLM: "LTBS", DOH: "OTHH", DUB: "EIDW", DUS: "EDDL", DXB: "OMDB", EAS: "LESO", EDI: "EGPH", EFL: "LGKF", EGC: "LFBE", EZE: "SAEZ", FAO: "LPFR", FCO: "LIRF", FLR: "LIRQ", FNC: "LPMA", FRA: "EDDF", FUE: "GCFV", GCI: "EGJB", GLA: "EGPF", GNB: "LFLS", GND: "TGPY", GRZ: "LOWG", GVA: "LSGG", HAM: "EDDH", HER: "LGIR", HKG: "VHHH", HND: "RJTT", HYD: "VOHS", IAD: "KIAD", IAH: "KIAH", IBZ: "LEIB", INN: "LOWI", INV: "EGPE", ISB: "OPIS", IST: "LTFM", IVL: "EFIV", JER: "EGJJ", JFK: "KJFK", JNB: "FAOR", JRO: "HTKJ", JSI: "LGSK", JTR: "LGSR", KEF: "BIKF", KGS: "LGKO", KIN: "MKJP", KLX: "LGKL", KUL: "WMKK", KWI: "OKBK", LAS: "KLAS", LAX: "KLAX", LCA: "LCLK", LIN: "LIML", LIS: "LPPT", LOS: "DNMM", LPA: "GCLP", LYS: "LFLL", MAA: "VOMM", MAD: "LEMD", MAH: "LEMH", MAN: "EGCC", MCO: "KMCO", MCT: "OOMS", MEX: "MMMX", MIA: "KMIA", MLA: "LMML", MPL: "LFMT", MRS: "LFML", MRU: "FIMP", MSY: "KMSY", MUC: "EDDM", NAP: "LIRN", NBO: "HKJK", NCE: "LFMN", NCL: "EGNT", OLB: "LIEO", OPO: "LPPR", ORD: "KORD", OSL: "ENGM", PFO: "LCPH", PHL: "KPHL", PHX: "KPHX", PIT: "KPIT", PLS: "MBPV", PMI: "LEPA", POS: "TTPP", PRG: "LKPR", PSA: "LIRP", PUJ: "MDPC", PVG: "ZSPD", PVK: "LGPZ", RAK: "GMMX", RBA: "GMME", RHO: "LGRP", RTM: "EHRD", RVN: "EFRO", SAN: "KSAN", SEA: "KSEA", SEZ: "FSIA", SFO: "KSFO", SIN: "WSSS", SJO: "MROC", SKB: "TKPK", SKG: "LGTS", SOF: "LBSF", SPU: "LDSP", SSH: "HESH", STL: "KSTL", SVQ: "LEZL", SZG: "LOWS", TFS: "GCTS", TIA: "LATI", TIV: "LYTV", TLN: "LFTH", TLS: "LFBO", TLV: "LLBG", TPA: "KTPA", TRN: "LIMF", UVF: "TLPL", VCE: "LIPZ", VIE: "LOWW", VRN: "LIPX", WAW: "EPWA", YUL: "CYUL", YVR: "CYVR", YYZ: "CYYZ", ZAG: "LDZA", ZNZ: "HTZA", ZRH: "LSZH", ZTH: "LGZA",
};

const longHaul = new Set([
  "ACC", "ANU", "ATL", "AUH", "AUS", "BAH", "BKK", "BLR", "BNA", "BOM", "BOS", "BWI", "CMB", "CPT", "CUN", "DEL", "DEN", "DFW", "DOH", "DXB", "EZE", "GND", "HKG", "HND", "HYD", "IAD", "IAH", "ISB", "JFK", "JNB", "JRO", "KIN", "KUL", "KWI", "LAS", "LAX", "LOS", "MAA", "MCO", "MCT", "MEX", "MIA", "MRU", "MSY", "NBO", "ORD", "PHL", "PHX", "PIT", "PLS", "POS", "PUJ", "PVG", "SAN", "SEA", "SEZ", "SFO", "SIN", "SJO", "SKB", "STL", "TLV", "TPA", "UVF", "YUL", "YVR", "YYZ", "ZNZ",
]);
const veryLongHaul = new Set(["CPT", "EZE", "HKG", "HND", "JNB", "KUL", "PVG", "SIN"]);
const domesticOrNear = new Set(["ABZ", "BHD", "DUB", "EDI", "GCI", "GLA", "INV", "JER", "MAN", "NCL"]);

function hash(input: string) {
  return [...input].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
}

function durationFor(hub: BavNetworkRouteSeed["from"], destination: string) {
  if (domesticOrNear.has(destination)) return destination === "DUB" ? "1h 25m" : "1h 20m";
  if (veryLongHaul.has(destination)) return destination === "EZE" ? "14h 00m" : "12h 00m";
  if (longHaul.has(destination)) {
    if (["ATL", "AUS", "BOS", "BWI", "JFK", "MSY", "PHL", "PIT", "YYZ", "YUL"].includes(destination)) return "8h 00m";
    if (["CPT", "JNB", "NBO", "SEZ"].includes(destination)) return "11h 00m";
    if (["DOH", "DXB", "AUH", "BAH", "KWI", "MCT", "TLV"].includes(destination)) return "7h 00m";
    return "10h 00m";
  }
  if (hub === "LCY") return "1h 45m";
  if (["KEF", "TIV", "TFS", "FNC", "LCA", "PFO", "AYT"].includes(destination)) return "4h 15m";
  return "2h 15m";
}

function addDuration(time: string, duration: string) {
  const [hour, minute] = time.split(":").map(Number);
  const hours = Number(/(\d+)h/.exec(duration)?.[1] ?? 0);
  const minutes = Number(/(\d+)m/.exec(duration)?.[1] ?? 0);
  const total = hour * 60 + minute + hours * 60 + minutes;
  const day = total >= 24 * 60 ? " +1" : "";
  return `${String(Math.floor((total % (24 * 60)) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}${day}`;
}

function dispatchTime(hub: BavNetworkRouteSeed["from"], destination: string) {
  const seed = hash(`${hub}-${destination}`);
  const baseHour = hub === "LCY" ? 6 : hub === "LGW" ? 7 : 8;
  const hour = baseHour + (seed % 10);
  const minute = [0, 10, 20, 30, 40, 50][Math.floor(seed / 10) % 6];
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function aircraftFor(hub: BavNetworkRouteSeed["from"], destination: string) {
  if (hub === "LCY") return "Embraer E190";
  if (!longHaul.has(destination)) return destination.length % 3 === 0 ? "Airbus A321neo" : "Airbus A320neo";
  if (hub === "LGW") return "Boeing 777-200ER";
  if (["JFK", "MIA", "LAX", "SFO", "SEA", "YYZ"].includes(destination)) return "Airbus A350-1000";
  if (["BWI", "MSY", "SJO", "STL"].includes(destination)) return "Boeing 787-8";
  if (["CPT", "JNB", "NBO", "HND", "BKK", "SIN"].includes(destination)) return "Boeing 787-9";
  return "Boeing 777-300ER";
}

function serviceNumber(hub: BavNetworkRouteSeed["from"], index: number) {
  const base = hub === "LHR" ? 1000 : hub === "LGW" ? 2000 : 8000;
  return `BAV${base + index + 1}`;
}

function publishedSeasonality(hub: BavNetworkRouteSeed["from"], destination: string): Pick<BavNetworkRouteSeed, "validFrom" | "operatingDays"> {
  // BA announced LGW–CMB for Mon/Wed/Fri from 23 October 2026. It should not
  // appear as a bookable BAV service before its real-world seasonal launch.
  if (hub === "LGW" && destination === "CMB") return { validFrom: "2026-10-23", operatingDays: [1, 3, 5] };
  return {};
}

export const BAV_NETWORK_2026: BavNetworkRouteSeed[] = (Object.entries(destinationsByHub) as Array<[BavNetworkRouteSeed["from"], readonly string[]]>).flatMap(([hub, destinations]) =>
  Array.from(new Set(destinations)).map((destination, index) => {
    const departure = dispatchTime(hub, destination);
    const duration = durationFor(hub, destination);
    return {
      id: `bav-network-2026-${hub.toLowerCase()}-${destination.toLowerCase()}`,
      from: hub,
      to: destination,
      flightNumber: serviceNumber(hub, index),
      departure,
      arrival: addDuration(departure, duration),
      duration,
      aircraft: aircraftFor(hub, destination),
      slots: 12,
      active: true,
      ...publishedSeasonality(hub, destination),
    };
  }),
);
