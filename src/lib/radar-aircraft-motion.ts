/** Display-only interpolation. Never writes predicted points into the flight/track data. */
export type AircraftPose = { latitude:number; longitude:number; altitudeFt:number; headingDeg:number };
export type AircraftMotionReport = AircraftPose & { timestamp?:string };
type TimedPose = AircraftPose & { time:number };

// Covers the five-second browser poll plus normal telemetry/network jitter.
export const AIRCRAFT_PLAYBACK_DELAY_MS = 15_000;
const MAX_SEGMENT_MS = 30_000;
const wrap = (value:number) => ((value+180)%360+360)%360-180;
const clamp = (value:number,min:number,max:number) => Math.max(min,Math.min(max,value));
function timed(report:AircraftMotionReport):TimedPose|null {
  const time=Date.parse(report.timestamp??"");
  if(!Number.isFinite(time)||![report.latitude,report.longitude,report.altitudeFt,report.headingDeg].every(Number.isFinite)||Math.abs(report.latitude)>90||Math.abs(report.longitude)>180)return null;
  return {time,latitude:report.latitude,longitude:report.longitude,altitudeFt:report.altitudeFt,headingDeg:report.headingDeg};
}
function connected(a:TimedPose,b:TimedPose) {
  const seconds=(b.time-a.time)/1000;
  const lat=(b.latitude-a.latitude)*Math.PI/180,lon=wrap(b.longitude-a.longitude)*Math.PI/180;
  const h=Math.sin(lat/2)**2+Math.cos(a.latitude*Math.PI/180)*Math.cos(b.latitude*Math.PI/180)*Math.sin(lon/2)**2;
  const km=12742*Math.asin(Math.sqrt(clamp(h,0,1)));
  // Simulator relocation / reconnect: don't animate a flight across the planet.
  return seconds>0&&seconds<=MAX_SEGMENT_MS/1000&&km<=Math.max(2,seconds)&&Math.abs(b.altitudeFt-a.altitudeFt)*.3048<=Math.max(1000,seconds*200);
}

export class AircraftMotion {
  private reports:TimedPose[]=[];
  private playhead=0;
  private lastNow=0;
  private epochNow=0;
  private epochUtc=0;
  private origin=0;
  private latest=-Infinity;
  private pose:AircraftPose={latitude:0,longitude:0,altitudeFt:0,headingDeg:0};
  private instant=false;

  sync(report:AircraftMotionReport,history:readonly AircraftMotionReport[],now:number,utc:number,instant=false) {
    if(![report.latitude,report.longitude,report.altitudeFt,report.headingDeg].every(Number.isFinite)||Math.abs(report.latitude)>90||Math.abs(report.longitude)>180)return;
    const newest=timed(report);
    if(instant||!newest) {
      this.instant=true;this.reports=[];this.latest=-Infinity;
      Object.assign(this.pose,report);return;
    }
    if(newest.time>utc+5000) {
      // A new marker still starts at its valid reported coordinates, never the origin.
      if(this.latest===-Infinity){this.instant=true;Object.assign(this.pose,report);}
      return;
    }
    // Selection changes, identical polls and late packets must not restart/rewind playback.
    if(!this.instant&&newest.time<=this.latest)return;
    const previous=this.reports.at(-1);
    const reset=this.instant||!previous||!connected(previous,newest);
    const candidates=[...(reset?[]:this.reports),...history.map(timed).filter((p):p is TimedPose=>!!p&&p.time<=newest.time),newest];
    const sorted=[...new Map(candidates.map(p=>[p.time,p])).values()].sort((a,b)=>a.time-b.time).slice(-64);
    // Keep only the latest continuous run; don't interpolate gaps or relocation history.
    let first=sorted.length-1;
    while(first>0&&connected(sorted[first-1],sorted[first]))first--;
    this.reports=sorted.slice(first);this.latest=newest.time;this.instant=false;
    if(reset) {
      this.epochNow=this.lastNow=now;this.epochUtc=utc;
      this.origin=newest.time;
      const fresh=Math.abs(utc-newest.time)<=60_000;
      this.playhead=fresh?clamp(utc-this.origin-AIRCRAFT_PLAYBACK_DELAY_MS,this.reports[0].time-this.origin,0):0;
      this.interpolate();
    }
  }

  sample(now:number):AircraftPose {
    if(this.instant||!this.reports.length)return this.pose;
    const dt=Math.max(0,now-this.lastNow);
    // Relative milliseconds avoid accumulating sub-frame rounding on Unix-epoch timestamps.
    const target=this.epochUtc-this.origin+now-this.epochNow-AIRCRAFT_PLAYBACK_DELAY_MS;
    if(dt>2000) {
      // A suspended/background tab resumes at the buffered report, not a fast-forward animation.
      this.playhead=Math.max(this.playhead,Math.min(this.latest-this.origin,target));
    } else {
      const error=target-dt-this.playhead;
      // Slowly recover buffer drift after a delayed packet (maximum 10% speed correction).
      // Analytic damping is independent of render frame rate; no per-packet ease-to-stop.
      const correction=clamp(error*(1-Math.exp(-dt/30_000)),-dt*.1,dt*.1);
      this.playhead=Math.min(this.latest-this.origin,this.playhead+dt+correction);
    }
    this.lastNow=Math.max(this.lastNow,now);
    return this.interpolate();
  }

  /** Bounded display history for cosmetic trails; never extrapolates or changes playback. */
  history(seconds:number) {
    if(this.instant||!this.reports.length)return [];
    const result:Array<AircraftPose & {age:number}>=[];
    const hold=Math.max(0,this.epochUtc-this.origin+this.lastNow-this.epochNow-AIRCRAFT_PLAYBACK_DELAY_MS-this.playhead);
    const start=Math.max(this.reports[0].time-this.origin,this.playhead-Math.min(60,Math.max(0,seconds))*1000);
    for(let t=start;t<this.playhead-100;t+=1000) {
      const age=(this.playhead-t+hold)/1000;
      if(age<=seconds)result.push({...this.interpolate(t,{latitude:0,longitude:0,altitudeFt:0,headingDeg:0}),age});
    }
    return result;
  }

  private interpolate(time=this.playhead,pose=this.pose) {
    let a=this.reports[0],b=a;
    for(const report of this.reports) {
      b=report;if(report.time-this.origin>=time)break;a=report;
    }
    const t=b.time===a.time?0:clamp((time-(a.time-this.origin))/(b.time-a.time),0,1);
    pose.latitude=a.latitude+(b.latitude-a.latitude)*t;
    pose.longitude=wrap(a.longitude+wrap(b.longitude-a.longitude)*t);
    pose.altitudeFt=a.altitudeFt+(b.altitudeFt-a.altitudeFt)*t;
    pose.headingDeg=(a.headingDeg+wrap(b.headingDeg-a.headingDeg)*t+360)%360;
    return pose;
  }
}
