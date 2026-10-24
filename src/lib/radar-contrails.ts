/** Cosmetic exhaust trails, never a weather observation or a modification of telemetry. */
export const CONTRAIL_PROFILES = {
  low: { aircraft:4, seconds:18, interval:1, cloudSamples:3 },
  medium: { aircraft:8, seconds:30, interval:.6, cloudSamples:4 },
  high: { aircraft:16, seconds:45, interval:.5, cloudSamples:6 },
  ultra: { aircraft:24, seconds:60, interval:.5, cloudSamples:8 },
} as const;
export const CONTRAIL_MAX_POINTS=128;
export type EngineAnchor = readonly [number,number,number];
const twin=(x:number,y:number,z:number):readonly EngineAnchor[]=>[[-x,y,z],[x,y,z]];
// Metres in the centred asset frame: +X right, +Y up, +Z aft. Calibrated to
// the shipped models' nozzle/engine geometry; not aircraft performance data.
const engines:Record<string,readonly EngineAnchor[]>={
  a318:twin(6.29,-4.6,-1),a319:twin(6.29,-4.55,-1.4),a320:twin(6.29,-4.53,-2.3),a321:twin(6.29,-4.4,-2.1),
  a332:twin(9.41,-6.4,-3.6),a333:twin(9.4,-6.4,-2),a359:twin(10.37,-6.33,-3),
  a380:[[-25.44,-8.18,7.09],[-14.88,-9.17,-1.19],[14.86,-9.17,-1.19],[25.42,-8.18,7.09]],
  b738:twin(5.16,-5.11,-1.45),
  b744:[[-21.25,-7.18,4.39],[-13.37,-7.83,-3.2],[13.6,-7.76,-3.25],[21.36,-7.3,4.38]],
  b772:twin(9.89,-6.74,-3.5),b773:twin(9.89,-6.74,-3.2),b788:twin(9.72,-5.55,-3.07),b789:twin(9.72,-5.55,-3.63),
};
export function contrailEngines(modelKey:string):readonly EngineAnchor[] {return engines[modelKey]??[];}
