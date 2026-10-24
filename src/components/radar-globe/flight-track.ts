import * as THREE from "three";
import { flightAltitudeColor, flightAltitudeMetres, flightTrackSegments, type FlightTrackPoint } from "@/lib/radar-aircraft";
import { geodeticToWorld } from "@/lib/radar-globe-geodesy";

/** Recorded altitude, not a decorative arc. The translucent curtain ends at the reference ellipsoid. */
export function flightTrackGeometry(points: FlightTrackPoint[]) {
  return flightTrackSegments(points).map(segment=>{
    const vertices: number[]=[],colors: number[]=[],curtain: number[]=[],curtainColors: number[]=[];
    for(let i=0;i<segment.length;i++){
      const p=segment[i],height=flightAltitudeMetres(p)!;
      const top=geodeticToWorld(p.latitude,p.longitude,height),color=flightAltitudeColor(p.altitudeFt!);
      vertices.push(...top);colors.push(...color);
      if(i===0)continue;
      const previous=segment[i-1],previousHeight=flightAltitudeMetres(previous)!;
      // Below-sea-level samples remain valid, but do not make an inverted ground curtain.
      if(height<=0&&previousHeight<=0)continue;
      const previousTop=geodeticToWorld(previous.latitude,previous.longitude,previousHeight);
      const a=geodeticToWorld(previous.latitude,previous.longitude),b=geodeticToWorld(p.latitude,p.longitude);
      const previousColor=flightAltitudeColor(previous.altitudeFt!);
      curtain.push(...a,...previousTop,...top,...a,...top,...b);
      curtainColors.push(...previousColor,...previousColor,...color,...previousColor,...color,...color);
    }
    const line=new THREE.BufferGeometry();line.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));line.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
    const ribbon=new THREE.BufferGeometry();ribbon.setAttribute("position",new THREE.Float32BufferAttribute(curtain,3));ribbon.setAttribute("color",new THREE.Float32BufferAttribute(curtainColors,3));
    return {line,ribbon};
  });
}
