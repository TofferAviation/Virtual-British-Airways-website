import type { RadarAuroraSample } from "./radar-external";

export type AuroraArcPoint = {
  latitude: number;
  longitude: number;
  strength: number;
};

/** NOAA input is geographic longitude/latitude/probability; no magnetic rotation.
 * Curves are inferred along the strongest latitude in each geographic sector.
 * No rays are constructed at a pole, and no empty sectors are invented. */
export function auroraOval(
  samples: RadarAuroraSample[],
  hemisphere: 1 | -1,
): AuroraArcPoint[] {
  const bins = Array.from({ length: 360 }, () => [] as RadarAuroraSample[]);
  for (const sample of samples) {
    const latitude = sample.latitude * hemisphere;
    if (latitude < 48 || latitude > 84 || sample.probability < 5) continue;
    const longitude = ((Math.round(sample.longitude) % 360) + 360) % 360;
    bins[longitude].push(sample);
  }
  const sectors = bins.map((bin, index) => {
    const max = Math.max(0, ...bin.map((point) => point.probability));
    const core = bin.filter((point) => point.probability >= max * 0.7);
    const sum = core.reduce((total, point) => total + point.probability, 0);
    return {
      longitude: index,
      latitude: sum
        ? core.reduce((total, p) => total + p.latitude * p.probability, 0) / sum
        : 65 * hemisphere,
      strength: max / 100,
    };
  });
  return sectors.map((sector, index) => {
    let sum = 0,
      latitude = 0,
      strength = 0;
    for (let delta = -3; delta <= 3; delta++) {
      const neighbour = sectors[(index + delta + 360) % 360],
        weight = (4 - Math.abs(delta)) * neighbour.strength;
      sum += weight;
      latitude += neighbour.latitude * weight;
      strength += (neighbour.strength * (4 - Math.abs(delta))) / 16;
    }
    return {
      longitude: sector.longitude,
      latitude: sum ? latitude / sum : sector.latitude,
      strength: Math.min(1, strength),
    };
  });
}
