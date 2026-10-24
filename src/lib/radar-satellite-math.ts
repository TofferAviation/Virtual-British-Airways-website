/** Observational cloud contract. Coordinates are cell centres, north-first,
 * west=-180, no duplicate dateline/polar row. Never interpolate categorical masks. */
import { estimatedSatelliteThickness } from "./radar-satellite-render.ts";
export const SATELLITE_MAX_AGE_MS = 35 * 60_000;
export const SATELLITE_CLOUD_FLAGS = { unknown: 0, clear: 1, uncertain: 2, probablyCloudy: 3, cloudy: 4, opticalDepthMissing: 8, topMissing: 16, baseEstimated: 32 } as const;
export type AbiProjection = { longitude: number; height: number; semiMajor: number; semiMinor: number; sweep: "x" };
export type SatelliteSource = { satellite: string; scanStartAt: string; scanEndAt: string; mask: string; opticalDepth: string; topHeight: string };
export type SatelliteFrame = { observedAt: string; sources: SatelliteSource[]; volume: string };
export type SatelliteCloudObservation = {
  version: 2; mode: "satellite-observed"; status: "ready" | "unknown";
  revision?: string;
  reason?: string; current: SatelliteFrame; previous: SatelliteFrame | null;
  /** R/G=east/north velocity in 2 m/s steps, biased by 128. B=confidence,
   * A=0 unclassified, 128 transported/stable, 255 developing. */
  motion: string; intervalSeconds: number;
  winds: { source: "NOAA GFS"; layer: string; validAt: string } | null;
  counts: { cloudy: number; reconstructed: number; clear: number; uncertain: number; unknown: number; opticalDepthMissing: number; topMissing: number; developing: number };
};

/** Earth geodetic coordinate -> ABI scan angles, from the file's ellipsoid and
 * perspective metadata (not a Mercator overlay or a hard-coded satellite slot). */
export function abiScanAngles(latitude: number, longitude: number, p: AbiProjection) {
  if (p.sweep !== "x" || ![latitude,longitude,p.longitude,p.height,p.semiMajor,p.semiMinor].every(Number.isFinite) || Math.abs(latitude)>90 || p.height<=0 || p.semiMinor<=0 || p.semiMajor<p.semiMinor) return null;
  const rad=Math.PI/180,lat=latitude*rad,lon=(longitude-p.longitude)*rad;
  const e2=1-(p.semiMinor/p.semiMajor)**2,n=p.semiMajor/Math.sqrt(1-e2*Math.sin(lat)**2);
  const x=n*Math.cos(lat)*Math.cos(lon),y=n*Math.cos(lat)*Math.sin(lon),z=n*(1-e2)*Math.sin(lat);
  const sx=p.height+p.semiMajor-x,sy=-y,sz=z,length=Math.hypot(sx,sy,sz);
  const cosZenith=(sx*Math.cos(lat)*Math.cos(lon)+sy*Math.cos(lat)*Math.sin(lon)-sz*Math.sin(lat))/length;
  // Ray direction is satellite -> ground; the surface normal faces the satellite.
  const visibility=(sx*x-y*y-z*z*(p.semiMajor/p.semiMinor)**2);
  if(visibility<=0)return null;
  return {x:Math.asin(-sy/length),y:Math.atan2(sz,sx),zenith:Math.acos(Math.max(-1,Math.min(1,cosZenith)))/rad};
}

/** Sample the actual product grid; x and y can be increasing/decreasing and
 * different products may have different resolutions. */
export function abiPixel(angle: number, first: number, step: number, size: number) {
  if(!Number.isFinite(angle)||!Number.isFinite(first)||!Number.isFinite(step)||step===0)return -1;
  const q=(angle-first)/step;
  return q>=-.5&&q<size-.5?Math.max(0,Math.min(size-1,Math.round(q))):-1;
}

/** Only ACMF's good-quality ECM classifications can grant cloud support.
 * Bad quality, space/fill and probably-clear are never manufactured clouds. */
export function satelliteMaskState(ecm: number, dqf: number) {
  if(dqf!==0||!Number.isInteger(ecm)||ecm<0||ecm>3)return 0;
  return ecm===0?1:ecm===1?2:ecm===2?3:4;
}
export function satelliteIsCloud(flags: number) { const state=flags&7;return state===3||state===4; }
export function satelliteOpticalDepth(encoded: number) { return Math.expm1(encoded/255*Math.log(161)); }
export function encodeSatelliteColumn(state: number, opticalDepth: number | null, topMetres: number | null): [number,number,number,number] {
  if(state<3||state>4)return [0,0,0,state>=0&&state<=2?state:0];
  let flags=state|32;
  // Keep detected locations, but never invent optical depth or top height.
  // Missing required retrievals make the VOLUME unknown, not the mask clear.
  const tau=opticalDepth!==null&&Number.isFinite(opticalDepth)&&opticalDepth>=0&&opticalDepth<=160?opticalDepth:(flags|=8,0);
  const top=topMetres!==null&&Number.isFinite(topMetres)&&topMetres>=200&&topMetres<=18000?topMetres:(flags|=16,0);
  if(flags&24)return [Math.round(Math.log1p(tau)/Math.log(161)*255),0,Math.round(top/100),flags];
  const thickness=estimatedSatelliteThickness(top,tau);
  return [Math.round(Math.log1p(tau)/Math.log(161)*255),Math.round((top-thickness)/100),Math.round(top/100),flags];
}
export function satelliteGridIndex(latitude: number, longitude: number, width: number, height: number) {
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90)return -1;
  const x=Math.floor((((longitude+180)%360+360)%360)/360*width),y=Math.min(height-1,Math.floor((90-latitude)/180*height));
  return y*width+x;
}
export function satelliteWindPixel(east: number, north: number, confidence: number, developing: boolean | null): [number,number,number,number] {
  const pack=(n:number)=>Math.max(1,Math.min(255,Math.round(n/2)+128));
  return [pack(east),pack(north),Math.round(Math.max(0,Math.min(1,confidence))*255),developing===null?0:developing?255:128];
}

export type CloudMotionPrior = (latitude:number,longitude:number,topMetres:number)=>{east:number;north:number}|null;
/** Conservative patch tracking, initialized by atmospheric wind. Unknown
 * samples never count as clear or as evidence of developing cover. */
export function estimateSatelliteMotion(current: Uint8Array, previous: Uint8Array | null, width: number, height: number, seconds: number, wind: CloudMotionPrior=()=>null) {
  const output=new Uint8Array(width*height*4);for(let i=0;i<output.length;i+=4){output[i]=output[i+1]=128;}
  if(!previous||seconds<120||seconds>1800)return output;
  const step=360/width,block=8,metres=111195;
  const index=(x:number,y:number)=>y<0||y>=height?-1:((y*width+(x%width+width)%width)*4);
  const signal=(data:Uint8Array,i:number)=>satelliteIsCloud(data[i+3])?.4+.6*data[i]/255:0;
  for(let by=0;by<height;by+=block)for(let bx=0;bx<width;bx+=block){
    const cx=Math.min(width-1,bx+4),cy=Math.min(height-1,by+4),lat=90-(cy+.5)*step,lon=-180+(cx+.5)*step;
    const centre=index(cx,cy),prior=wind(lat,lon,current[centre+2]*100),eastScale=metres*step*Math.max(.1,Math.cos(lat*Math.PI/180));
    const px=(prior?.east??0)*seconds/eastScale,py=-(prior?.north??0)*seconds/(metres*step);
    const limitX=Math.min(12,Math.ceil(150*seconds/eastScale)),limitY=Math.min(12,Math.ceil(150*seconds/(metres*step)));
    let best=Infinity,second=Infinity,dx=Math.round(px),dy=Math.round(py),evidence=0,variance=0;
    for(let sy=Math.round(py)-2;sy<=Math.round(py)+2;sy++)for(let sx=Math.round(px)-2;sx<=Math.round(px)+2;sx++){
      if(Math.abs(sx)>limitX||Math.abs(sy)>limitY)continue;
      let error=0,n=0,sum=0,squares=0;
      for(let yy=-3;yy<=3;yy++)for(let xx=-3;xx<=3;xx++){
        const a=index(cx+xx,cy+yy),b=index(cx+xx-sx,cy+yy-sy);
        if(a<0||b<0||(current[a+3]&7)===0||(previous[b+3]&7)===0||(current[a+3]&7)===2||(previous[b+3]&7)===2)continue;
        const ca=signal(current,a),cb=signal(previous,b);error+=(ca-cb)**2;sum+=ca;squares+=ca*ca;n++;
      }
      if(n<24)continue;
      const score=error/n;
      if(score<best){second=best;best=score;dx=sx;dy=sy;evidence=n;variance=squares/n-(sum/n)**2;}else if(score<second)second=score;
    }
    const textureConfidence=variance>.015&&Number.isFinite(second)?Math.max(0,Math.min(1,(second-best)/Math.max(.015,second))):0;
    const tracked=evidence>=24&&best<.12&&textureConfidence>.12;
    const east=tracked?dx*eastScale/seconds:(prior?.east??0),north=tracked?-dy*metres*step/seconds:(prior?.north??0);
    const confidence=tracked?textureConfidence:prior?.15:0;
    const shiftX=east*seconds/eastScale,shiftY=-north*seconds/(metres*step);
    for(let y=by;y<Math.min(height,by+block);y++)for(let x=bx;x<Math.min(width,bx+block);x++){
      const a=index(x,y);if(!satelliteIsCloud(current[a+3]))continue;
      const b=index(Math.round(x-shiftX),Math.round(y-shiftY));let developing:boolean|null=null;
      if(b>=0&&(previous[b+3]&7)===1){
        // A neighbouring transported cloud can explain a new edge. Require a
        // wholly confidently clear 3x3 previous neighbourhood before growth.
        let clear=true;
        for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++){const j=index(Math.round(x-shiftX)+xx,Math.round(y-shiftY)+yy);if(j<0||(previous[j+3]&7)!==1)clear=false;}
        developing=clear?(tracked||prior!==null?true:null):false;
      } else if(b>=0&&satelliteIsCloud(previous[b+3]))developing=false;
      output.set(satelliteWindPixel(east,north,confidence,developing),a);
    }
  }
  return output;
}
