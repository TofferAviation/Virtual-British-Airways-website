export type GlobeQuality = "low" | "medium" | "high" | "ultra";
export type GlobeQualityRequest = GlobeQuality | "auto";
export type GlobeCapabilities = { mobile?: boolean; memoryGb?: number; cores?: number; saveData?: boolean };

/** Independent terrain/cloud budgets: reducing cloud cost never halves ground tiles. */
export const GLOBE_PROFILES = {
  low:    { pixelRatio: 1,    groundPixels: 2_100_000, cloudScale: 0.5,  cloudPixels: 420_000,   fps: 30, steps: 20, lightSamples: 3, shadowSamples: 8,  airSamples: 6,  maxLevel: 8,  tilePixels: 680, cacheMb: 48,  maxTiles: 72,  requests: 2, anisotropy: 4 },
  medium: { pixelRatio: 1.25, groundPixels: 3_200_000, cloudScale: 0.67, cloudPixels: 850_000,   fps: 30, steps: 32, lightSamples: 4, shadowSamples: 12, airSamples: 8,  maxLevel: 9,  tilePixels: 560, cacheMb: 80,  maxTiles: 112, requests: 3, anisotropy: 8 },
  high:   { pixelRatio: 1.5,  groundPixels: 5_000_000, cloudScale: 0.85, cloudPixels: 1_500_000, fps: 45, steps: 48, lightSamples: 6, shadowSamples: 16, airSamples: 12, maxLevel: 10, tilePixels: 440, cacheMb: 128, maxTiles: 168, requests: 4, anisotropy: 8 },
  ultra:  { pixelRatio: 2,    groundPixels: 8_000_000, cloudScale: 1,    cloudPixels: 2_500_000, fps: 60, steps: 64, lightSamples: 6, shadowSamples: 16, airSamples: 12, maxLevel: 10, tilePixels: 360, cacheMb: 192, maxTiles: 224, requests: 6, anisotropy: 16 },
} as const;
export type GlobeProfile = (typeof GLOBE_PROFILES)[GlobeQuality];
const levels: GlobeQuality[] = ["low", "medium", "high", "ultra"];

export function initialGlobeQuality(caps: GlobeCapabilities): GlobeQuality {
  if (caps.mobile || caps.saveData || (caps.memoryGb !== undefined && caps.memoryGb <= 4) || (caps.cores !== undefined && caps.cores <= 2)) return "low";
  // CPU hints are not GPU benchmarks. Unknown devices start conservatively.
  return "medium";
}

export function globeRenderSize(width: number, height: number, dpr: number, quality: GlobeQuality) {
  const p = GLOBE_PROFILES[quality], area = Math.max(1, width * height);
  const ratio = Math.max(0.1, Math.min(dpr, p.pixelRatio, Math.sqrt(p.groundPixels / area)));
  const groundWidth = Math.max(1, Math.floor(width * ratio));
  const groundHeight = Math.max(1, Math.floor(height * ratio));
  const scale = Math.min(p.cloudScale, Math.sqrt(p.cloudPixels / (groundWidth * groundHeight)));
  return { ratio, groundWidth, groundHeight, cloudWidth: Math.max(1, Math.floor(groundWidth * scale)), cloudHeight: Math.max(1, Math.floor(groundHeight * scale)) };
}

/** Slow downgrade / much slower recovery. Compilation, hidden tabs and stalls
 * are excluded by the caller; an isolated long frame cannot change quality. */
export class AdaptiveGlobeQuality {
  quality: GlobeQuality;
  private samples: number[] = [];
  private windowAt = 0;
  private changedAt = 0;
  private slow = 0;
  private fast = 0;
  private ceiling: number;
  constructor(caps: GlobeCapabilities) {
    this.quality = initialGlobeQuality(caps);
    this.ceiling = this.quality === "low" ? 0 : 2;
  }
  reset(now: number) { this.samples = []; this.windowAt = now; this.changedAt = now; this.slow = this.fast = 0; }
  sample(costMs: number, now: number, enabled: boolean) {
    if (!enabled || !Number.isFinite(costMs) || costMs < 0) return this.quality;
    if (now - this.changedAt < 4000) return this.quality;
    this.samples.push(Math.min(1000, costMs));
    if (now - this.windowAt < 2000 || this.samples.length < 3) return this.quality;
    const sorted = this.samples.sort((a, b) => a - b);
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    this.samples = []; this.windowAt = now;
    const budget = 1000 / GLOBE_PROFILES[this.quality].fps;
    this.slow = p75 > budget * 1.12 ? this.slow + 1 : 0;
    // Only recover if the *next* tier's frame budget has ample headroom.
    const index = levels.indexOf(this.quality), next = levels[Math.min(3, index + 1)];
    this.fast = p75 < 1000 / GLOBE_PROFILES[next].fps * 0.55 ? this.fast + 1 : 0;
    if ((this.slow >= 2 && index > 0) || (this.fast >= 8 && index < this.ceiling)) {
      this.quality = levels[index + (this.slow >= 2 ? -1 : 1)];
      this.reset(now);
    }
    return this.quality;
  }
}

/** A separate split/merge threshold prevents oscillation while zoom settles. */
export function refineGlobeTile(pixels: number, hasChildren: boolean, target: number) {
  return pixels > target * (hasChildren ? 0.78 : 1.12);
}
