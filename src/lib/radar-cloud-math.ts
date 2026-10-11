/**
 * Small, dependency-free cloud-model helpers shared by the GFS decoder and
 * its fast regression checks. Values are deliberately expressed in metres so
 * model heights remain unambiguous until the globe projection consumes them.
 */
export const GFS_CLOUD_HEIGHT_SCALE_METRES = 100;
export const GFS_CLOUD_MIN_THICKNESS_METRES = 120;

export type CloudRendererQuality = "auto" | "low" | "medium" | "high" | "ultra";

export type CloudRendererCapabilities = {
  mobile: boolean;
  /** Browsers may deliberately omit this value; unknown is not low-memory. */
  memoryGb?: number;
  cores?: number;
};

export function clampCloudValue(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function cloudGridDimension(input: number, stride: number) {
  return Math.floor((input - 1) / stride) + 1;
}

/** A volume must have valid coverage and a meaningful model altitude range. */
export function isValidCloudColumn(coverage: number, baseHeight: number, topHeight: number) {
  return Number.isFinite(coverage)
    && Number.isFinite(baseHeight)
    && Number.isFinite(topHeight)
    && baseHeight >= 0
    && topHeight > baseHeight + GFS_CLOUD_MIN_THICKNESS_METRES;
}

/** Encode geopotential metres into the compact eight-bit client texture. */
export function encodeCloudHeight(heightMetres: number) {
  return clampCloudValue(Math.round(heightMetres / GFS_CLOUD_HEIGHT_SCALE_METRES), 0, 255);
}

/** Decode the client texture back to the model-scale metres used by the shader. */
export function decodeCloudHeight(encoded: number) {
  return clampCloudValue(encoded, 0, 255) * GFS_CLOUD_HEIGHT_SCALE_METRES;
}

/**
 * Full-globe presentation can modestly emphasise vertical relief while
 * retaining the measured model base. It is intentionally not data mutation.
 */
export function cloudPresentationHeight(baseMetres: number, modelMetres: number, enhanced = false) {
  return baseMetres + (modelMetres - baseMetres) * (enhanced ? 1.45 : 1);
}

/**
 * Select a stable cloud mesh profile without treating an omitted browser hint
 * as evidence of a low-end device. This runs only when settings change, so
 * the mesh cannot flicker between levels of detail during an orbit gesture.
 */
export function resolveCloudRendererQuality(
  requested: CloudRendererQuality,
  capabilities: CloudRendererCapabilities,
): Exclude<CloudRendererQuality, "auto"> {
  if (requested !== "auto") return requested;
  if (capabilities.mobile) return "low";

  const cores = capabilities.cores ?? 4;
  const memoryGb = capabilities.memoryGb;
  if (memoryGb !== undefined && memoryGb <= 4 && cores <= 4) return "low";
  if (cores >= 8 && (memoryGb === undefined || memoryGb >= 6)) return "high";
  return "medium";
}
