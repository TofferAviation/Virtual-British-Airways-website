import type { PilotRank } from "@/lib/pilot-ranks";

export type CareerEconomySettings = {
  currency: "GBP";
  label: string;
  rankHourlyRates: Record<PilotRank, number>;
  aircraftMultipliers: Record<"E190" | "A320_FAMILY" | "A320_NEO" | "B777" | "B787" | "A350" | "A380", number>;
  sectorAllowance: number;
  longHaulAllowance: number;
  commandBonus: number;
  instructorBonus: number;
  longHaulThresholdMinutes: number;
};

export type QualificationKind = "type_rating" | "command" | "instructor";
export type QualificationRequirements = {
  minimumRank?: PilotRank;
  minimumHours?: number;
  minimumSectors?: number;
  prerequisite?: string;
  requiresValidTypeRating?: boolean;
};

export type CareerQualificationDefinition = {
  id: string;
  kind: QualificationKind;
  name: string;
  aircraftFamily: string | null;
  variants: string[];
  description: string;
  virtualTrainingCost: number;
  recurrentTrainingCost: number;
  requirements: QualificationRequirements;
  trainingModules: string[];
  checkFlightRequired: boolean;
  staffApprovalRequired: boolean;
  validityMonths: number | null;
  recurrentIntervalMonths: number | null;
  available: boolean;
  displayOrder: number;
};

export const DEFAULT_CAREER_ECONOMY: CareerEconomySettings = {
  currency: "GBP",
  label: "British Airways Virtual economy values",
  rankHourlyRates: {
    Cadet: 15,
    "Second Officer": 30,
    "First Officer": 40,
    "Senior First Officer": 55,
    Captain: 75,
    "Senior Captain": 90,
    "Training Captain": 105,
  },
  aircraftMultipliers: {
    E190: 1,
    A320_FAMILY: 1,
    A320_NEO: 1.03,
    B777: 1.12,
    B787: 1.12,
    A350: 1.15,
    A380: 1.18,
  },
  sectorAllowance: 20,
  longHaulAllowance: 80,
  commandBonus: 20,
  instructorBonus: 25,
  longHaulThresholdMinutes: 360,
};

const modules = ["Aircraft Systems", "Standard Operating Procedures", "Normal Operations", "Abnormal / Emergency Procedures", "Simulator / Knowledge Assessment", "Check Flight"];

export const DEFAULT_QUALIFICATION_DEFINITIONS: CareerQualificationDefinition[] = [
  { id: "E190", kind: "type_rating", name: "Embraer E170/190", aircraftFamily: "E190", variants: ["E170", "E190"], description: "Regional multi-crew virtual qualification. BAV uses a scaled virtual market benchmark, not a real-world fee.", virtualTrainingCost: 7500, recurrentTrainingCost: 1000, requirements: { minimumRank: "Second Officer", minimumHours: 40, minimumSectors: 15 }, trainingModules: ["Aircraft Systems", "Standard Operating Procedures", "Normal Operations", "Check Flight"], checkFlightRequired: true, staffApprovalRequired: true, validityMonths: 24, recurrentIntervalMonths: 24, available: true, displayOrder: 10 },
  { id: "A320_FAMILY", kind: "type_rating", name: "Airbus A320 Family", aircraftFamily: "A320_FAMILY", variants: ["A319", "A320", "A321", "A320neo", "A321neo"], description: "A319, A320 and A321 family virtual qualification. BAV uses a scaled virtual market benchmark, not a real-world fee.", virtualTrainingCost: 10000, recurrentTrainingCost: 1250, requirements: { minimumRank: "Second Officer", minimumHours: 50, minimumSectors: 20 }, trainingModules: modules.slice(0, 4).concat("Check Flight"), checkFlightRequired: true, staffApprovalRequired: true, validityMonths: 24, recurrentIntervalMonths: 24, available: true, displayOrder: 20 },
  { id: "B787", kind: "type_rating", name: "Boeing 787", aircraftFamily: "B787", variants: ["B787-8", "B787-9", "B787-10"], description: "Long-haul Boeing 787 virtual type rating. BAV uses a scaled virtual market benchmark, not a real-world fee.", virtualTrainingCost: 12500, recurrentTrainingCost: 1600, requirements: { minimumRank: "First Officer", minimumHours: 200, minimumSectors: 60, prerequisite: "A320_FAMILY" }, trainingModules: modules, checkFlightRequired: true, staffApprovalRequired: true, validityMonths: 24, recurrentIntervalMonths: 24, available: true, displayOrder: 30 },
  { id: "B777", kind: "type_rating", name: "Boeing 777", aircraftFamily: "B777", variants: ["B777-200ER", "B777-300ER"], description: "Long-haul Boeing 777 virtual type rating. BAV uses a scaled virtual market benchmark, not a real-world fee.", virtualTrainingCost: 12500, recurrentTrainingCost: 1600, requirements: { minimumRank: "First Officer", minimumHours: 250, minimumSectors: 75 }, trainingModules: modules, checkFlightRequired: true, staffApprovalRequired: true, validityMonths: 24, recurrentIntervalMonths: 24, available: true, displayOrder: 40 },
  { id: "A350", kind: "type_rating", name: "Airbus A350", aircraftFamily: "A350", variants: ["A350-900", "A350-1000"], description: "Long-haul Airbus A350 virtual type rating. BAV uses a scaled virtual market benchmark, not a real-world fee.", virtualTrainingCost: 15000, recurrentTrainingCost: 1900, requirements: { minimumRank: "Senior First Officer", minimumHours: 350, minimumSectors: 100 }, trainingModules: modules, checkFlightRequired: true, staffApprovalRequired: true, validityMonths: 24, recurrentIntervalMonths: 24, available: true, displayOrder: 50 },
  { id: "A380", kind: "type_rating", name: "Airbus A380", aircraftFamily: "A380", variants: ["A380-800"], description: "Flagship Airbus A380 virtual type rating. BAV uses a scaled virtual market benchmark, not a real-world fee.", virtualTrainingCost: 17500, recurrentTrainingCost: 2200, requirements: { minimumRank: "Senior First Officer", minimumHours: 500, minimumSectors: 140 }, trainingModules: modules, checkFlightRequired: true, staffApprovalRequired: true, validityMonths: 24, recurrentIntervalMonths: 24, available: true, displayOrder: 60 },
  { id: "COMMAND", kind: "command", name: "Command Upgrade", aircraftFamily: null, variants: [], description: "Virtual command qualification, assessed separately from rank and aircraft type rating.", virtualTrainingCost: 7500, recurrentTrainingCost: 1500, requirements: { minimumRank: "Senior First Officer", minimumHours: 800, minimumSectors: 200, requiresValidTypeRating: true }, trainingModules: ["Command Course", "Command Decision Making", "Command Check"], checkFlightRequired: true, staffApprovalRequired: true, validityMonths: 24, recurrentIntervalMonths: 24, available: true, displayOrder: 70 },
];

export function aircraftFamilyForModel(aircraft: string) {
  const model = aircraft.toLowerCase();
  if (model.includes("a380")) return "A380" as const;
  if (model.includes("a350")) return "A350" as const;
  if (model.includes("777")) return "B777" as const;
  if (model.includes("787")) return "B787" as const;
  if (model.includes("embraer") || model.includes("e190") || model.includes("e170")) return "E190" as const;
  if (model.includes("neo")) return "A320_NEO" as const;
  return "A320_FAMILY" as const;
}

export function ratingForAircraft(aircraft: string) {
  const family = aircraftFamilyForModel(aircraft);
  return family === "A320_NEO" ? "A320_FAMILY" : family;
}
