import type { AuroraSettings } from "@/components/BaRadarAuroraLayer";
import type { CloudSettings } from "@/components/BaRadarCloudLayer";
import { DEFAULT_AURORA_MOTION_SPEED } from "./radar-aurora-motion";

/** Production and visual QA share the accepted appearance. Each caller owns
 * its settings; a screenshot override must never become another viewer's default. */
export function createGlobeAuroraSettings(): AuroraSettings {
  return {
    activity: 1, animationSpeed: DEFAULT_AURORA_MOTION_SPEED, brightness: 1,
    quality: "auto", enhancedPresentation: false, hemisphere: "both",
    photoMode: false, kpOverrideEnabled: false, debug: "off",
  };
}

export function createGlobeCloudSettings(): CloudSettings {
  return {
    realWorld: true, opacity: 0.65, quality: "auto", low: true, middle: true,
    high: true, selfShadows: true, enhancedPresentation: false, debugMode: "lit",
  };
}
