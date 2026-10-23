export type AuroraQuality = "auto" | "high" | "balanced" | "low";
export type AuroraColour = "green" | "red" | "violet" | "blue";
export type AuroraColourGains = Record<AuroraColour, number>;
export type AuroraSettings = {
  activity: number;
  animationSpeed: number;
  brightness: number;
  quality: AuroraQuality;
  /** Exposure only, never changes NOAA coverage or emission altitude. */
  enhancedPresentation: boolean;
  hemisphere?: "both" | "north" | "south";
  debug?: "off" | "field" | "altitude";
  vortexStrength?: number;
  photoMode?: boolean;
  colourGains?: AuroraColourGains;
};

export const DEFAULT_AURORA_SETTINGS: AuroraSettings = {
  activity: 1,
  animationSpeed: .25,
  brightness: 1,
  quality: "auto",
  enhancedPresentation: false,
  vortexStrength: .65,
  photoMode: false,
  colourGains: { green: 1, red: 1, violet: 1, blue: 1 },
};
function bounded(value: number | undefined, fallback: number, maximum: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, value!)) : fallback;
}
/** The only conversion from artist controls to GPU values. Old saved settings
 * stay valid, and disabling photo mode restores neutral emission immediately. */
export function auroraAppearance(settings: Partial<AuroraSettings>) {
  return {
    speed: bounded(settings.animationSpeed, .25, 1.8),
    vortex: bounded(settings.vortexStrength, .65, 1.5),
    gains: (["green", "red", "violet", "blue"] as const).map(c =>
      settings.photoMode ? bounded(settings.colourGains?.[c], 1, 4) : 1,
    ) as [number, number, number, number],
  };
}
export function advanceAuroraTime(time: number, deltaSeconds: number, speed: number) {
  return time + bounded(deltaSeconds, 0, .1) * bounded(speed, .25, 1.8);
}
export function resetAuroraAppearance(settings: AuroraSettings): AuroraSettings {
  return {...settings, activity:1, brightness:1, enhancedPresentation:false,
    animationSpeed:.25, vortexStrength:.65, photoMode:false,
    colourGains:{green:1,red:1,violet:1,blue:1}};
}
