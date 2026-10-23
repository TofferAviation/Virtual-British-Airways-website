import type { RadarAuroraSample } from "./radar-external";
export const AURORA_WIDTH = 360, AURORA_HEIGHT = 181;
export function auroraField(samples: RadarAuroraSample[]) {
  const grid=new Uint8Array(AURORA_WIDTH*AURORA_HEIGHT);
  for(const p of samples) {
    if(!Number.isFinite(p.probability)||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||Math.abs(p.latitude)>90) continue;
    const x=((Math.round(p.longitude)+180)%360+360)%360, y=90-Math.round(p.latitude);
    grid[y*360+x]=Math.round(Math.max(0,Math.min(100,p.probability))*2.55);
  }
  return grid;
}
export function auroraAt(grid: Uint8Array, latitude: number, longitude: number) {
  const x=((longitude+180)%360+360)%360, y=90-Math.max(-90,Math.min(90,latitude));
  const col=Math.floor(x), row=Math.min(179,Math.floor(y)), dx=x-col,dy=y-row;
  const a=grid[row*360+col], b=grid[row*360+(col+1)%360], c=grid[(row+1)*360+col], d=grid[(row+1)*360+(col+1)%360];
  return ((a*(1-dx)+b*dx)*(1-dy)+(c*(1-dx)+d*dx)*dy)/255;
}
/** Activity-weighted tracks distribute curtains over the full forecast width,
 * including multiple latitude peaks. No magnetic rotation or Kp expansion. */
export function auroraTrack(grid: Uint8Array, longitude: number, hemisphere: 1|-1, quantile: number) {
  const values=Array.from({length:89},(_,i)=>Math.max(0,auroraAt(grid,i*hemisphere,longitude)-0.045));
  const total=values.reduce((a,b)=>a+b,0);
  if(!total) return {latitude:65*hemisphere,strength:0};
  let sum=0;
  for(let i=0;i<values.length;i++) { sum+=values[i]; if(sum>=total*quantile) return {latitude:(i-0.5+(total*quantile-(sum-values[i]))/Math.max(1e-8,values[i]))*hemisphere,strength:auroraAt(grid,i*hemisphere,longitude)}; }
  return {latitude:88*hemisphere,strength:0};
}
export function validateOvation(value: unknown) {
  if(!value||typeof value!=="object") throw new Error("Missing NOAA forecast");
  const record=value as Record<string,unknown>;
  if(!/^\[\s*Longitude\s*,\s*Latitude\s*,\s*Aurora\s*\]$/i.test(String(record["Data Format"]))) throw new Error("Unexpected NOAA coordinate order");
  const observed=Date.parse(String(record["Observation Time"])), forecast=Date.parse(String(record["Forecast Time"]));
  if(!Number.isFinite(observed)||!Number.isFinite(forecast)||forecast<observed) throw new Error("Invalid NOAA timestamps");
  const coordinates=record.coordinates;
  if(!Array.isArray(coordinates)||coordinates.length<1000||coordinates.length>300000) throw new Error("Incomplete NOAA field");
  const longitudeSet=new Set<number>(), latitudeSet=new Set<number>(), cells=new Set<string>();
  const samples: RadarAuroraSample[]=[];
  for(const p of coordinates) {
    if(!Array.isArray(p)||p.length<3||!p.slice(0,3).every(v=>typeof v==="number"&&Number.isFinite(v))||p[0]<-180||p[0]>=360||Math.abs(p[1])>90||p[2]<0||p[2]>100) throw new Error("Invalid NOAA cell");
    const longitude=((p[0]+180)%360+360)%360-180;
    const key=`${longitude}/${p[1]}`;
    if(cells.has(key)) throw new Error("Duplicate NOAA cell");
    cells.add(key); longitudeSet.add(longitude); latitudeSet.add(p[1]); samples.push({longitude,latitude:p[1],probability:p[2]});
  }
  const lon=[...longitudeSet].sort((a,b)=>a-b),lat=[...latitudeSet].sort((a,b)=>a-b);
  if(lon.length*lat.length!==samples.length||lat[0]!==-90||lat.at(-1)!==90||lon.length<180) throw new Error("Incomplete NOAA globe");
  // Inspect the lattice, then fail closed on unsupported resolution changes.
  // This renderer's interpolated texture is explicitly one degree.
  const step=360/lon.length;
  if(step!==1||lat.length!==181||lat.some((v,i)=>i>0&&Math.abs(v-lat[i-1]-1)>1e-6)||lon.some((v,i)=>i>0&&Math.abs(v-lon[i-1]-step)>1e-6)) throw new Error("Unsupported NOAA lattice");
  return { samples, observedAt:new Date(observed).toISOString(), forecastAt:new Date(forecast).toISOString(), width:lon.length, height:lat.length };
}
