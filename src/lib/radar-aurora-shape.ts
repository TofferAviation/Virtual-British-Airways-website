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
/** Monotonic local tempo: each ray bundle gently accelerates/relaxes without
 * ever reversing time or reseeding when speed/pause/forecast changes. */
export function auroraRayTime(key:number,time:number) {
  const speed=.7+.6*auroraSeed(key+31),frequency=.12+.1*auroraSeed(key+32),phase=auroraSeed(key+33)*Math.PI*2;
  return time*speed+(Math.sin(phase+time*frequency)-Math.sin(phase))*.22/frequency;
}
export function auroraRayPeriod(key:number) { return 4+auroraSeed(key)*10; }
/** Independent, overlapping ray packets. Every new event is born/dies at zero
 * amplitude, so changing its seed/height cannot cause a one-frame flash. */
export function auroraRayState(s: number, seed: number, time: number) {
  const cell = Math.floor(s / 38);
  let energy = 0, weight = 0, height = 0, lift = 0, front = 0, pulseWeight = 0;
  for (let i = -1; i <= 1; i++) {
    const id = cell + i, key = id * 11.73 + seed * 3.17;
    const period = auroraRayPeriod(key), clock = (auroraRayTime(key,time) + auroraSeed(key + 1) * 30) / period;
    const cycle = Math.floor(clock), age = fract(clock), event = auroraSeed(key + cycle * 5.31 + 17);
    const rise=.22+auroraSeed(key+cycle*5.31+19)*.16;
    const release=rise+.08+auroraSeed(key+cycle*5.31+20)*.12, end=.86+auroraSeed(key+cycle*5.31+21)*.10;
    const attack = smooth(Math.min(1, age / rise)), decay = 1 - smooth(Math.max(0, Math.min(1, (age-release)/(end-release))));
    const pulse = attack * decay * (.18 + event * 1.82);
    const centre = (id + .5) * 38 + (auroraSeed(key + 5) - .5) * 14 + Math.sin(time * (.06 + auroraSeed(key + 6) * .09) + key) * 6;
    const offset = Math.abs(s - centre), q = offset / (10 + auroraSeed(key + 2) * 16);
    const spatial = Math.exp(-.5 * q * q) * (1 - smooth(Math.max(0, Math.min(1, (offset - 30) / 8))));
    const baseline = .025 + .08 * auroraNoise(key, time * .06);
    const e = spatial * (baseline + pulse);
    energy += e; weight += spatial;
    height += e * (150 + auroraSeed(key + 3) * 55 + pulse * 65);
    lift += spatial * (auroraNoise(key + 8, time * .09) * 22 + pulse * 9);
    front += spatial * pulse * (118 + smooth(age) * (85 + event * 95)); pulseWeight += spatial * pulse;
  }
  return { energy: energy / Math.max(.5, weight), top: height / Math.max(.0001, energy), lift: lift / Math.max(.5, weight), front: front / Math.max(.0001, pulseWeight) };
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

export const auroraRayGLSL = `
float auroraRayTime(float key,float time){
  float speed=.7+.6*auroraHash(key+31.0),frequency=.12+.1*auroraHash(key+32.0),phase=auroraHash(key+33.0)*6.28318530718;
  return time*speed+(sin(phase+time*frequency)-sin(phase))*.22/frequency;
}
vec4 auroraRayState(float s,float seed,float time){
  float cell=floor(s/38.0),energy=0.0,weight=0.0,top=0.0,lift=0.0,front=0.0,pulseWeight=0.0;
  for(int i=-1;i<=1;i++){
    float id=cell+float(i),key=id*11.73+seed*3.17;
    float period=4.0+auroraHash(key)*10.0,clock=(auroraRayTime(key,time)+auroraHash(key+1.0)*30.0)/period;
    float cycle=floor(clock),age=fract(clock),event=auroraHash(key+cycle*5.31+17.0);
    // Quintic envelopes match the CPU reference and have zero endpoint slope.
    float rise=.22+auroraHash(key+cycle*5.31+19.0)*.16,release=rise+.08+auroraHash(key+cycle*5.31+20.0)*.12,end=.86+auroraHash(key+cycle*5.31+21.0)*.10;
    float a=clamp(age/rise,0.0,1.0),d=clamp((age-release)/(end-release),0.0,1.0);
    float attack=a*a*a*(a*(a*6.0-15.0)+10.0),decay=1.0-d*d*d*(d*(d*6.0-15.0)+10.0);
    float pulse=attack*decay*(.18+event*1.82);
    float centre=(id+.5)*38.0+(auroraHash(key+5.0)-.5)*14.0+sin(time*(.06+auroraHash(key+6.0)*.09)+key)*6.0;
    float offset=abs(s-centre),q=offset/(10.0+auroraHash(key+2.0)*16.0),edge=clamp((offset-30.0)/8.0,0.0,1.0);
    float spatial=exp(-.5*q*q)*(1.0-edge*edge*edge*(edge*(edge*6.0-15.0)+10.0));
    float baseline=.025+.08*auroraNoise(vec2(key,time*.06)),e=spatial*(baseline+pulse);
    energy+=e;weight+=spatial;
    top+=e*(150.0+auroraHash(key+3.0)*55.0+pulse*65.0);
    lift+=spatial*(auroraNoise(vec2(key+8.0,time*.09))*22.0+pulse*9.0);
    float travel=age*age*age*(age*(age*6.0-15.0)+10.0);
    front+=spatial*pulse*(118.0+travel*(85.0+event*95.0));pulseWeight+=spatial*pulse;
  }
  return vec4(energy/max(.5,weight),top/max(.0001,energy),lift/max(.5,weight),front/max(.0001,pulseWeight));
}
`;
