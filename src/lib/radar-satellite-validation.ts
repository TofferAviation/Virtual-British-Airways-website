import type { RadarCloudData } from "./radar-external";
import { SATELLITE_MAX_AGE_MS } from "./radar-satellite-math.ts";

export function unknownSatelliteCloudData(reason:string,now=Date.now()):RadarCloudData {
  return {source:"NOAA GOES ABI",sourceResolutionDeg:0,displayResolutionDeg:0,cycleAt:"",validAt:"",fetchedAt:new Date(now).toISOString(),stale:false,width:1,height:1,west:-180,north:90,stepDeg:360,encoding:"rgba8-base64",fields:[],layers:[],satellite:{version:2,mode:"satellite-observed",status:"unknown",reason,current:{observedAt:"",sources:[],volume:"AAAAAA=="},previous:null,motion:"gIAAAA==",intervalSeconds:0,winds:null,counts:{cloudy:0,reconstructed:0,clear:0,uncertain:0,unknown:1,opticalDepthMissing:0,topMissing:0,developing:0}}};
}
export function validateSatelliteCloudData(input:unknown,now=Date.now(),deep=true):RadarCloudData {
  const d=input as RadarCloudData,s=d?.satellite;
  if(d?.source!=="NOAA GOES ABI"||d.encoding!=="rgba8-base64"||!s||s.version!==2||s.mode!=="satellite-observed"||s.status!=="ready")throw Error("Not an observed satellite field");
  if(!Number.isInteger(d.width)||!Number.isInteger(d.height)||d.width<4||d.height<2||d.width!==2*d.height||d.width*d.height>6_480_000||Math.abs(d.width*d.stepDeg-360)>1e-5||d.west!==-180||d.north!==90)throw Error("Invalid observation grid");
  const time=Date.parse(s.current?.observedAt),bytes=d.width*d.height*4;
  if(!Number.isFinite(time)||time>now+120_000||now-time>SATELLITE_MAX_AGE_MS)throw Error("Stale satellite observation");
  const validateFrame=(frame:typeof s.current,previous=false)=>{
    const at=Date.parse(frame.observedAt);
    if(!Number.isFinite(at)||at>time||(previous&&time-at>1800_000)||!frame.sources.length||frame.sources.length>2)throw Error("Invalid observation history");
    if(typeof frame.volume!=="string"||frame.volume.length!==Math.ceil(bytes/3)*4)throw Error("Incomplete observation volume");
    for(const source of frame.sources){
      const begin=Date.parse(source.scanStartAt),end=Date.parse(source.scanEndAt);
      if(![begin,end].every(Number.isFinite)||end<begin||end-begin>15*60_000||end>time+120_000||now-end>SATELLITE_MAX_AGE_MS+(previous?1800_000:0))throw Error("Invalid scan times");
      for(const [name,product] of [["mask","ACMF"],["opticalDepth","CODF"],["topHeight","ACHAF"]] as const){
        const u=new URL(source[name]);
        if(u.protocol!=="https:"||!["noaa-goes18.s3.amazonaws.com","noaa-goes19.s3.amazonaws.com"].includes(u.hostname)||!u.pathname.startsWith(`/ABI-L2-${product}/`)||!u.pathname.endsWith(".nc"))throw Error("Unrecognized observation provenance");
      }
    }
  };
  validateFrame(s.current);if(s.previous)validateFrame(s.previous,true);
  if(typeof s.motion!=="string"||s.motion.length!==Math.ceil(bytes/3)*4||!Number.isFinite(s.intervalSeconds)||s.intervalSeconds<0||s.intervalSeconds>1800)throw Error("Invalid motion field");
  if(s.previous?Math.abs((time-Date.parse(s.previous.observedAt))/1000-s.intervalSeconds)>1:s.intervalSeconds!==0)throw Error("Motion interval is not the observed scan interval");
  if(deep) {
    for(const frame of [s.current,...s.previous?[s.previous]:[]]) {
      const data=Buffer.from(frame.volume,"base64");if(data.length!==bytes||data.toString("base64")!==frame.volume)throw Error("Invalid observation encoding");
      for(let i=0;i<data.length;i+=4){const flag=data[i+3],state=flag&7;
        if(state>4||(flag&~63)!==0)throw Error("Invalid cloud mask flag");
        if(state<3&&(data[i]!==0||data[i+1]!==0||data[i+2]!==0||flag!==state))throw Error("Clear/unknown cannot carry cloud geometry");
        if(state>=3){
          if((flag&32)===0||data[i+2]>180)throw Error("Invalid cloud column");
          if((flag&24)===0&&data[i+1]>=data[i+2])throw Error("Invalid estimated base/thickness");
          if((flag&8)&&data[i]!==0)throw Error("Missing optical depth cannot have fabricated extinction");
          if((flag&16)&&data[i+2]!==0)throw Error("Missing cloud top cannot have fabricated height");
        }
      }
    }
    if(Buffer.from(s.motion,"base64").length!==bytes)throw Error("Invalid motion encoding");
    if(Object.values(s.counts).some(n=>!Number.isInteger(n)||n<0||n>d.width*d.height)||s.counts.cloudy+s.counts.clear+s.counts.uncertain+s.counts.unknown!==d.width*d.height)throw Error("Invalid observation coverage counts");
  }
  return d;
}
