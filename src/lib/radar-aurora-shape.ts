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
/** Bounded, smoothly blended altitude-level curls in km. These are an artistic
 * deformation about the WMM-aligned ray, not a fluid/plasma simulation. Upper
 * and lower structures counter-turn; no whole-oval spin or hard layer seams. */
export function auroraVortex(s: number, h: number, seed: number, time: number, strength: number) {
  const step=(a:number,b:number,x:number)=>{const q=Math.max(0,Math.min(1,(x-a)/(b-a)));return q*q*(3-2*q);};
  const upper=step(220,340,h),lower=1-step(155,240,h),middle=1-lower;
  const hand=auroraSeed(seed+81)>.5?1:-1;
  const twist=(h-110)*.012*hand;
  const a=s*.007+seed-time*.07+twist;
  const b=s*.011+seed*1.7+time*.045-twist*.7;
  const c=s*.005+seed*2.3-time*.025+twist*.5;
  const radius=(6+10*auroraNoise(s*.003+seed,time*.02))*step(100,150,h)*(1-step(380,450,h))*Math.max(0,Math.min(1.5,strength));
  return {
    north:((Math.cos(a)*lower+Math.cos(b)*middle)*(1-upper)+Math.cos(c)*upper)*radius,
    east:((Math.sin(a)*lower+Math.sin(b)*middle)*(1-upper)+Math.sin(c)*upper)*radius*.7,
  };
}
/** Independent, overlapping ray packets. Every new event is born/dies at zero
 * amplitude, so changing its seed/height cannot cause a one-frame flash. */
export function auroraRayState(s: number, seed: number, time: number) {
  const cell = Math.floor(s / 38);
  let energy = 0, weight = 0, height = 0, lift = 0, front = 0, pulseWeight = 0;
  for (let i = -1; i <= 1; i++) {
    const id = cell + i, key = id * 11.73 + seed * 3.17;
    const period = 4 + auroraSeed(key) * 10, clock = (time + auroraSeed(key + 1) * 30) / period;
    const cycle = Math.floor(clock), age = fract(clock), event = auroraSeed(key + cycle * 5.31 + 17);
    const attack = smooth(Math.min(1, age / .24)), decay = 1 - smooth(Math.max(0, Math.min(1, (age - .30) / .70)));
    const pulse = attack * decay * (.18 + event * 1.82);
    const centre = (id + .5) * 38 + (auroraSeed(key + 5) - .5) * 14 + Math.sin(time * (.06 + auroraSeed(key + 6) * .09) + key) * 6;
    const offset = Math.abs(s - centre), q = offset / (10 + auroraSeed(key + 2) * 16);
    const spatial = Math.exp(-.5 * q * q) * (1 - smooth(Math.max(0, Math.min(1, (offset - 30) / 8))));
    const baseline = .025 + .08 * auroraNoise(key, time * .06);
    const e = spatial * (baseline + pulse);
    energy += e; weight += spatial;
    height += e * (150 + auroraSeed(key + 3) * 55 + pulse * 65);
    lift += spatial * (auroraNoise(key + 8, time * .09) * 22 + pulse * 9);
    front += spatial * pulse * (118 + age * (85 + event * 95)); pulseWeight += spatial * pulse;
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
vec2 auroraVortex(float s,float h,float seed,float time,float strength){
  float upper=smoothstep(220.0,340.0,h),lower=1.0-smoothstep(155.0,240.0,h),middle=1.0-lower;
  float hand=auroraHash(seed+81.0)>.5?1.0:-1.0,twist=(h-110.0)*.012*hand;
  float a=s*.007+seed-time*.07+twist,b=s*.011+seed*1.7+time*.045-twist*.7,c=s*.005+seed*2.3-time*.025+twist*.5;
  float radius=(6.0+10.0*auroraNoise(vec2(s*.003+seed,time*.02)))*smoothstep(100.0,150.0,h)*(1.0-smoothstep(380.0,450.0,h))*clamp(strength,0.0,1.5);
  return vec2(mix(cos(a)*lower+cos(b)*middle,cos(c),upper),mix(sin(a)*lower+sin(b)*middle,sin(c),upper)*.7)*radius;
}
float auroraTaper(float u){return smoothstep(0.0,.16,u)*(1.0-smoothstep(.78,1.0,u));}
`;

export const auroraRayGLSL = `
vec4 auroraRayState(float s,float seed,float time){
  float cell=floor(s/38.0),energy=0.0,weight=0.0,top=0.0,lift=0.0,front=0.0,pulseWeight=0.0;
  for(int i=-1;i<=1;i++){
    float id=cell+float(i),key=id*11.73+seed*3.17;
    float period=4.0+auroraHash(key)*10.0,clock=(time+auroraHash(key+1.0)*30.0)/period;
    float cycle=floor(clock),age=fract(clock),event=auroraHash(key+cycle*5.31+17.0);
    // Quintic envelopes match the CPU reference and have zero endpoint slope.
    float a=clamp(age/.24,0.0,1.0),d=clamp((age-.30)/.70,0.0,1.0);
    float attack=a*a*a*(a*(a*6.0-15.0)+10.0),decay=1.0-d*d*d*(d*(d*6.0-15.0)+10.0);
    float pulse=attack*decay*(.18+event*1.82);
    float centre=(id+.5)*38.0+(auroraHash(key+5.0)-.5)*14.0+sin(time*(.06+auroraHash(key+6.0)*.09)+key)*6.0;
    float offset=abs(s-centre),q=offset/(10.0+auroraHash(key+2.0)*16.0),edge=clamp((offset-30.0)/8.0,0.0,1.0);
    float spatial=exp(-.5*q*q)*(1.0-edge*edge*edge*(edge*(edge*6.0-15.0)+10.0));
    float baseline=.025+.08*auroraNoise(vec2(key,time*.06)),e=spatial*(baseline+pulse);
    energy+=e;weight+=spatial;
    top+=e*(150.0+auroraHash(key+3.0)*55.0+pulse*65.0);
    lift+=spatial*(auroraNoise(vec2(key+8.0,time*.09))*22.0+pulse*9.0);
    front+=spatial*pulse*(118.0+age*(85.0+event*95.0));pulseWeight+=spatial*pulse;
  }
  return vec4(energy/max(.5,weight),top/max(.0001,energy),lift/max(.5,weight),front/max(.0001,pulseWeight));
}
`;
