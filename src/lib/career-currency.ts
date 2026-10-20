import { ratingForAircraft, type CareerQualificationDefinition } from "@/lib/career-defaults";
import type { PilotQualification } from "@/lib/pilot-career";
import type { PilotPirep } from "@/lib/pilot-operations-store";

const VIRTUAL_RECENCY_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type VirtualCurrencyState = "recent" | "refresher" | "recurrent_due" | "not_current";

export type VirtualCurrencyEntry = {
  id: string;
  name: string;
  state: VirtualCurrencyState;
  stateLabel: string;
  sectorsInWindow: number;
  blockMinutesInWindow: number;
  lastFlightAt: string | null;
  qualificationStatus: PilotQualification["status"];
  validUntil: string | null;
};

function timestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A private, read-only BAV planning aid. It deliberately does not model
 * real-world regulatory currency, crew licensing, duty rules or privileges.
 */
export function getVirtualCurrencyEntries(input: {
  qualifications: PilotQualification[];
  definitions: CareerQualificationDefinition[];
  pireps: PilotPirep[];
  now?: number;
}): VirtualCurrencyEntry[] {
  const now = input.now ?? Date.now();
  const windowStart = now - VIRTUAL_RECENCY_WINDOW_DAYS * DAY_MS;
  const definitions = new Map(input.definitions.map((definition) => [definition.id, definition]));
  const accepted = input.pireps.filter((pirep) => pirep.status === "accepted" && timestamp(pirep.completedAt) !== null);

  return input.qualifications
    .map((qualification) => ({ qualification, definition: definitions.get(qualification.qualificationDefinitionId) }))
    .filter((item): item is { qualification: PilotQualification; definition: CareerQualificationDefinition } => Boolean(item.definition?.aircraftFamily && item.definition.kind === "type_rating"))
    .sort((left, right) => left.definition.displayOrder - right.definition.displayOrder)
    .map(({ qualification, definition }) => {
      const matching = accepted
        .filter((pirep) => ratingForAircraft(pirep.aircraft) === definition.id)
        .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
      const inWindow = matching.filter((pirep) => (timestamp(pirep.completedAt) ?? 0) >= windowStart);
      const lastFlightAt = matching[0]?.completedAt ?? null;
      let state: VirtualCurrencyState = "recent";
      let stateLabel = "Recent virtual flying";

      if (["recurrent_due", "expiring_soon"].includes(qualification.status)) {
        state = "recurrent_due";
        stateLabel = qualification.status === "recurrent_due" ? "Recurrent review due" : "Recurrent review approaching";
      } else if (["expired", "suspended"].includes(qualification.status)) {
        state = "not_current";
        stateLabel = qualification.status === "expired" ? "Qualification expired" : "Qualification suspended";
      } else if (!inWindow.length) {
        state = "refresher";
        stateLabel = "Refresher suggested";
      }

      return {
        id: qualification.id,
        name: definition.name,
        state,
        stateLabel,
        sectorsInWindow: inWindow.length,
        blockMinutesInWindow: inWindow.reduce((total, pirep) => total + Math.max(0, pirep.blockMinutes), 0),
        lastFlightAt,
        qualificationStatus: qualification.status,
        validUntil: qualification.validUntil,
      };
    });
}

export { VIRTUAL_RECENCY_WINDOW_DAYS };
