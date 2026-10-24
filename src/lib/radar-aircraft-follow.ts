import { aircraftFrame } from "./radar-aircraft.ts";
import { geodeticToWorld, worldToGeodetic, wrapLongitude, type GlobeVector } from "./radar-globe-geodesy.ts";
import type { AircraftPose } from "./radar-aircraft-motion.ts";

export type AircraftFollowCamera = { latitude:number; longitude:number; heightKm:number; bearing:number; pitch:number };
const valid = (p:AircraftPose|null|undefined):p is AircraftPose => !!p &&
  [p.latitude,p.longitude,p.altitudeFt,p.headingDeg].every(Number.isFinite) && Math.abs(p.latitude)<=90 && Math.abs(p.longitude)<=180;
const position = (p:AircraftPose) => geodeticToWorld(p.latitude,p.longitude,p.altitudeFt*.3048);
const dot = (a:readonly number[],b:readonly number[]) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

/** Explicit close-up action: 200 m aft / 250 m above the displayed aircraft. */
export function aircraftChaseView(p:AircraftPose):AircraftFollowCamera {
  const frame=aircraftFrame(p.latitude,p.longitude,p.headingDeg),point=position(p);
  const eye=worldToGeodetic(point.map((v,i)=>v+frame.back[i]*.2+frame.up[i]*.25) as GlobeVector);
  return {latitude:eye.latitude,longitude:eye.longitude,heightKm:eye.heightMetres/1000,bearing:p.headingDeg,pitch:Math.atan2(.2,.25)*180/Math.PI};
}

/** Transport the user's current eye offset with the *displayed* aircraft.
 * No prediction, extra smoothing lag, render objects, timers or React updates.
 * Pan/look/dolly changes are inputs, not overwritten by a fixed chase preset. */
export class AircraftFollow {
  id="";
  private previous:AircraftPose|null=null;
  private lastNow=0;

  start(id:string,p:AircraftPose|null|undefined,now:number) {
    if(!id||!valid(p)){this.stop();return null;}
    this.id=id;this.previous={...p};this.lastNow=now;
    return aircraftChaseView(p);
  }

  stop() {this.id="";this.previous=null;}

  advance(id:string,p:AircraftPose|null|undefined,camera:AircraftFollowCamera,now:number):AircraftFollowCamera|null {
    if(!this.previous||id!==this.id||!valid(p)||!Object.values(camera).every(Number.isFinite)) {this.stop();return null;}
    const old=this.previous,a=position(old),b=position(p);
    const seconds=Math.max(0,(now-this.lastNow)/1000);
    // Relocations / replay seeks must not drag the eye across the planet.
    if(Math.hypot(...b.map((v,i)=>v-a[i]))>Math.max(.25,Math.min(2,seconds)*1.2) || Math.abs(p.altitudeFt-old.altitudeFt)*.3048>1000) {
      this.stop();return null;
    }
    this.lastNow=now;this.previous={...p};
    if(p.latitude===old.latitude&&p.longitude===old.longitude&&p.altitudeFt===old.altitudeFt&&p.headingDeg===old.headingDeg)return camera;
    const from=aircraftFrame(old.latitude,old.longitude,old.headingDeg),to=aircraftFrame(p.latitude,p.longitude,p.headingDeg);
    const eye=geodeticToWorld(camera.latitude,camera.longitude,camera.heightKm*1000),offset=eye.map((v,i)=>v-a[i]);
    const right=dot(offset,from.right),up=dot(offset,from.up),back=dot(offset,from.back);
    const next=worldToGeodetic(b.map((v,i)=>v+right*to.right[i]+up*to.up[i]+back*to.back[i]) as GlobeVector);
    return {latitude:next.latitude,longitude:next.longitude,heightKm:next.heightMetres/1000,
      bearing:wrapLongitude(camera.bearing+wrapLongitude(p.headingDeg-old.headingDeg)),pitch:camera.pitch};
  }
}
