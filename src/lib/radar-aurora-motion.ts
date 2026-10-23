/** Shared by the public globe, legacy settings and visual QA. 100% retains
 * the old clock scale; the calmer default is 30%, not a new spatial shape. */
export const DEFAULT_AURORA_MOTION_SPEED = .3;
export function auroraMotionSpeed(value:number) {
  return Number.isFinite(value)?Math.max(0,Math.min(1.8,value)):DEFAULT_AURORA_MOTION_SPEED;
}
export function advanceAuroraTime(time:number,deltaSeconds:number,speed:number) {
  const delta=Number.isFinite(deltaSeconds)?Math.max(0,Math.min(.1,deltaSeconds)):0;
  return time+delta*auroraMotionSpeed(speed);
}
