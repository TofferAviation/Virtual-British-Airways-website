/** Stable seeds and bounded regional arcs; never generate random numbers per frame. */
export type AuroraDetail = "low" | "balanced" | "high";
export const AURORA_DETAIL = {
  low: { lanes: 8, sectors: 12, columns: 24, rows: 10 },
  balanced: { lanes: 12, sectors: 12, columns: 32, rows: 12 },
  high: { lanes: 12, sectors: 12, columns: 40, rows: 14 },
} as const;
const fract = (x: number) => x - Math.floor(x);
export function auroraSeed(x: number) { return fract(Math.sin(x * 127.1 + 311.7) * 43758.5453); }
export function auroraArc(lane: number, sector: number, hemisphere: number, lanes: number) {
  const seed = lane * 19.31 + sector * 7.73 + (hemisphere > 0 ? 3.17 : 181.37);
  const short = lane % 2 === 1;
  return {
    seed,
    centre: sector * 30 + (auroraSeed(seed) - .5) * 22 + lane * 11.3,
    span: (short ? 8 : 32) + auroraSeed(seed + 1) * (short ? 12 : 34),
    quantile: .06 + .88 * (lane + .15 + auroraSeed(seed + 2) * .7) / lanes,
    // More geometric detail must not invent extra light at a higher LOD.
    weight: (short ? .68 : 1) * 8 / lanes,
  };
}
function smooth(x: number) { return x * x * x * (x * (x * 6 - 15) + 10); }
export function auroraNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(fract(x)), fy = smooth(fract(y));
  const a = auroraSeed(ix + iy * 157), b = auroraSeed(ix + 1 + iy * 157);
  const c = auroraSeed(ix + (iy + 1) * 157), d = auroraSeed(ix + 1 + (iy + 1) * 157);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
/** CPU reference for the shader's coherent travelling fold (kilometres). */
export function auroraFold(s: number, seed: number, time: number) {
  const broad = auroraNoise(s * .002 + seed, time * .035 + seed);
  const wave = s * .014 - time * (.12 + auroraSeed(seed) * .08) + seed;
  const curl = Math.sin(wave + (broad - .5) * 5);
  return {
    north: (broad - .5) * 110 + curl * (16 + 26 * auroraNoise(s * .006 + seed, time * .07)),
    east: Math.cos(wave + curl * 1.4) * 28 + (auroraNoise(s * .003 - time * .025, seed + 8) - .5) * 40,
  };
}
// Kilometres along an individual arc, not pixels or longitude frequencies.
// Zoom therefore cannot regenerate the ray pattern.
export const auroraShapeGLSL = `
float auroraHash(float x){return fract(sin(x*127.1+311.7)*43758.5453);}
float auroraNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.0-15.0)+10.0);
  float a=auroraHash(i.x+i.y*157.0),b=auroraHash(i.x+1.0+i.y*157.0);
  float c=auroraHash(i.x+(i.y+1.0)*157.0),d=auroraHash(i.x+1.0+(i.y+1.0)*157.0);
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
vec2 auroraFold(float s,float seed,float time){
  float broad=auroraNoise(vec2(s*.002+seed,time*.035+seed));
  float wave=s*.014-time*(.12+auroraHash(seed)*.08)+seed;
  float curl=sin(wave+(broad-.5)*5.0);
  return vec2((broad-.5)*110.0+curl*(16.0+26.0*auroraNoise(vec2(s*.006+seed,time*.07))),
    cos(wave+curl*1.4)*28.0+(auroraNoise(vec2(s*.003-time*.025,seed+8.0))-.5)*40.0);
}
float auroraTaper(float u){return smoothstep(0.0,.16,u)*(1.0-smoothstep(.78,1.0,u));}
`;
