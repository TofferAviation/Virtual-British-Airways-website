import type { RadarCloudData } from "./radar-external";

export const FORECAST_MAX_AGE_MS = 6 * 3600_000;
export const FORECAST_MAX_CYCLE_AGE_MS = 24 * 3600_000;
export const FORECAST_PROFILES = [
  { id: "low", label: "Low cloud", coverageField: "LCDC", representativePressureHpa: 850, basePressureHpa: 925, topPressureHpa: 700 },
  { id: "middle", label: "Middle cloud", coverageField: "MCDC", representativePressureHpa: 600, basePressureHpa: 700, topPressureHpa: 400 },
  { id: "high", label: "High cloud", coverageField: "HCDC", representativePressureHpa: 300, basePressureHpa: 400, topPressureHpa: 200 },
] as const;

/** Log-pressure interpolation through the model's geopotential heights, not
 * fixed global cloud-base/top heights. Boundary pressures are model averages. */
export function forecastPressureHeight(pressurePa: number, levels: ReadonlyArray<readonly [number, number]>) {
  if (!Number.isFinite(pressurePa) || pressurePa < 10_000 || pressurePa > 110_000) return null;
  for (let i = 1; i < levels.length; i++) {
    const [p0, h0] = levels[i - 1], [p1, h1] = levels[i];
    if (![h0,h1].every(Number.isFinite) || h0 < -1000 || h1 > 25_000 || h1 <= h0 || p0 <= p1) continue;
    if ((pressurePa <= p0 && pressurePa >= p1) || (i===1 && pressurePa>p0)) {
      const t = Math.log(p0 / pressurePa) / Math.log(p0 / p1);
      return h0 + (h1 - h0) * t;
    }
  }
  return null;
}

/** North-up [-180,180) point grid -> cell centres; wrap the dateline and
 * average the adjacent polar point rows. Invalid samples never become clear. */
export function sampleForecastGrid(values: ArrayLike<number>, width: number, height: number, x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const at = (dx: number, dy: number) => values[Math.min(height - 1,Math.max(0,iy+dy))*width+((ix+dx)%width+width)%width];
  const a=at(0,0),b=at(1,0),c=at(0,1),d=at(1,1);
  return [a,b,c,d].every(v=>Number.isFinite(v)&&Math.abs(v)<1e10) ? (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy : NaN;
}

/** Strictly separate artifact contract. No arbitrary source URLs, stale
 * weather, satellite flags or malformed texture bytes can enable this mode. */
export function validateForecastCloudData(input: unknown, now=Date.now(), inspectPixels=true): RadarCloudData {
  const d=input as RadarCloudData, f=d?.forecast;
  if (d?.source!=="NOAA GFS" || f?.mode!=="global-forecast" || f.model!=="GFS" || d.satellite || d.stale || d.encoding!=="rgba8-base64") throw Error("Not a global GFS forecast");
  const allowed=new Set(["source","forecast","sourceResolutionDeg","displayResolutionDeg","cycleAt","validAt","fetchedAt","stale","width","height","west","north","stepDeg","encoding","fields","layers"]);
  if(Object.keys(d).some(key=>!allowed.has(key))||Object.keys(f).some(key=>!["mode","model","forecastHour","sourceUrl","layerBounds"].includes(key)))throw Error("Unexpected forecast artifact fields");
  const cycle=Date.parse(d.cycleAt),valid=Date.parse(d.validAt),fetched=Date.parse(d.fetchedAt);
  if (![cycle,valid,fetched].every(Number.isFinite) || cycle>now+120_000 || now-cycle>FORECAST_MAX_CYCLE_AGE_MS || valid>now+3600_000 || now-valid>FORECAST_MAX_AGE_MS || fetched>now+120_000 || fetched<cycle || !Number.isInteger(f.forecastHour) || f.forecastHour<1 || f.forecastHour>24 || valid-cycle!==f.forecastHour*3600_000) throw Error("Forecast outside its validity window");
  if (!/^https:\/\/noaa-gfs-bdp-pds\.s3\.amazonaws\.com\/gfs\.\d{8}\/(00|06|12|18)\/atmos\/gfs\.t\1z\.pgrb2\.0p25\.f\d{3}$/.test(f.sourceUrl) || f.layerBounds!=="time-averaged-pressure-interpolated-height") throw Error("Invalid forecast provenance");
  const cycleDate=new Date(cycle),hour=String(cycleDate.getUTCHours()).padStart(2,"0"),date=cycleDate.toISOString().slice(0,10).replaceAll("-","");
  if(cycle%(6*3600_000)!==0||f.sourceUrl!==`https://noaa-gfs-bdp-pds.s3.amazonaws.com/gfs.${date}/${hour}/atmos/gfs.t${hour}z.pgrb2.0p25.f${String(f.forecastHour).padStart(3,"0")}`)throw Error("Forecast source does not match its cycle/hour");
  if (d.width!==1440 || d.height!==720 || d.west!==-180 || d.north!==90 || d.stepDeg!==.25 || d.sourceResolutionDeg!==.25 || d.displayResolutionDeg!==.25 || !Array.isArray(d.layers) || d.layers.length!==3 || !Array.isArray(d.fields)) throw Error("Invalid global forecast grid");
  if(d.fields.length>32||d.fields.some(field=>typeof field!=="string"||!/^(HGT:(surface|\d{3,4} mb)|(LCDC:low|MCDC:middle|HCDC:high) cloud layer|PRES:(low|middle|high) cloud (bottom|top) level)$/.test(field)))throw Error("Invalid forecast field identifiers");
  for (const [index,profile] of FORECAST_PROFILES.entries()) {
    for(const field of [`${profile.coverageField}:${profile.id} cloud layer`,`PRES:${profile.id} cloud bottom level`,`PRES:${profile.id} cloud top level`])if(!d.fields.includes(field))throw Error("Missing forecast source field");
    const layer=d.layers[index];
    if (layer.id!==profile.id || layer.coverageField!==profile.coverageField || typeof layer.volume!=="string" || layer.volume.length!==d.width*d.height*4/3*4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(layer.volume)) throw Error("Invalid forecast layer");
    if (inspectPixels) {
      const bytes=Buffer.from(layer.volume,"base64");
      if (bytes.length!==d.width*d.height*4) throw Error("Invalid forecast texture length");
      for(let i=0;i<bytes.length;i+=4)if((bytes[i+3]!==0&&bytes[i+3]!==255)||(bytes[i+3]===255&&bytes[i]>0&&(bytes[i+2]<=bytes[i+1]||bytes[i+2]>180)))throw Error("Invalid forecast cloud column");
    }
  }
  return d;
}
