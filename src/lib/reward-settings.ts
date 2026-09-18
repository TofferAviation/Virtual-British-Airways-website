export type RewardSettings = {
  minimumVaPoints: number;
  vaPointsPerFiveBlockMinutes: number;
  vaPointsPerFiftyNm: number;
  minimumTierPoints: number;
  tierPointsPercent: number;
  tierBronzeThreshold: number;
  tierSilverThreshold: number;
  tierGoldThreshold: number;
};

export const DEFAULT_REWARD_SETTINGS: RewardSettings = {
  minimumVaPoints: 25,
  vaPointsPerFiveBlockMinutes: 1,
  vaPointsPerFiftyNm: 1,
  minimumTierPoints: 5,
  tierPointsPercent: 40,
  tierBronzeThreshold: 500,
  tierSilverThreshold: 1_500,
  tierGoldThreshold: 3_500,
};

function finiteInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

export function normalizeRewardSettings(value: unknown): RewardSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const settings: RewardSettings = {
    minimumVaPoints: finiteInteger(raw.minimumVaPoints, DEFAULT_REWARD_SETTINGS.minimumVaPoints, 0, 10_000),
    vaPointsPerFiveBlockMinutes: finiteInteger(raw.vaPointsPerFiveBlockMinutes, DEFAULT_REWARD_SETTINGS.vaPointsPerFiveBlockMinutes, 0, 1_000),
    vaPointsPerFiftyNm: finiteInteger(raw.vaPointsPerFiftyNm, DEFAULT_REWARD_SETTINGS.vaPointsPerFiftyNm, 0, 1_000),
    minimumTierPoints: finiteInteger(raw.minimumTierPoints, DEFAULT_REWARD_SETTINGS.minimumTierPoints, 0, 10_000),
    tierPointsPercent: finiteInteger(raw.tierPointsPercent, DEFAULT_REWARD_SETTINGS.tierPointsPercent, 0, 100),
    tierBronzeThreshold: finiteInteger(raw.tierBronzeThreshold, DEFAULT_REWARD_SETTINGS.tierBronzeThreshold, 1, 1_000_000),
    tierSilverThreshold: finiteInteger(raw.tierSilverThreshold, DEFAULT_REWARD_SETTINGS.tierSilverThreshold, 2, 1_000_000),
    tierGoldThreshold: finiteInteger(raw.tierGoldThreshold, DEFAULT_REWARD_SETTINGS.tierGoldThreshold, 3, 1_000_000),
  };

  if (settings.tierSilverThreshold <= settings.tierBronzeThreshold) settings.tierSilverThreshold = settings.tierBronzeThreshold + 1;
  if (settings.tierGoldThreshold <= settings.tierSilverThreshold) settings.tierGoldThreshold = settings.tierSilverThreshold + 1;
  return settings;
}

export function validateRewardSettings(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Reward settings must be provided.");
  const raw = value as Record<string, unknown>;
  const numericKeys: Array<keyof RewardSettings> = [
    "minimumVaPoints",
    "vaPointsPerFiveBlockMinutes",
    "vaPointsPerFiftyNm",
    "minimumTierPoints",
    "tierPointsPercent",
    "tierBronzeThreshold",
    "tierSilverThreshold",
    "tierGoldThreshold",
  ];
  if (numericKeys.some((key) => !Number.isFinite(Number(raw[key])))) throw new Error("Every reward setting must be a whole number.");
  if (Number(raw.tierSilverThreshold) <= Number(raw.tierBronzeThreshold) || Number(raw.tierGoldThreshold) <= Number(raw.tierSilverThreshold)) {
    throw new Error("Tier thresholds must increase from Bronze to Silver to Gold.");
  }
  const settings = normalizeRewardSettings(raw);
  return settings;
}

export function calculatePirepReward(input: { blockMinutes: number; distanceNm: number }, settings: RewardSettings) {
  const basePoints = Math.round(
    Math.max(0, input.blockMinutes) / 5 * settings.vaPointsPerFiveBlockMinutes +
    Math.max(0, input.distanceNm) / 50 * settings.vaPointsPerFiftyNm,
  );
  const points = Math.max(settings.minimumVaPoints, basePoints);
  const tierPoints = Math.max(settings.minimumTierPoints, Math.round(points * settings.tierPointsPercent / 100));
  return { points, tierPoints };
}
