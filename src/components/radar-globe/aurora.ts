import * as THREE from "three";
import { auroraField, auroraTrack } from "@/lib/radar-aurora-field";
import { geodeticNormal, geodeticToWorld, worldToGeodetic } from "@/lib/radar-globe-geodesy";
import { magneticField } from "@/lib/radar-aurora-magnetic";
import type { RadarAuroraData } from "@/lib/radar-external";

function trackPositions(grid: Uint8Array, hemisphere: 1|-1, sheet: number, sheets: number, columns: number, rows: number, year:number) {
  const points=new Float32Array((columns+1)*(rows+1)*3), normals=new Float32Array(points.length);
  const tracks=Array.from({length:360},(_,i)=>{
    const phase=i*Math.PI/180,seed=sheet*2.17+hemisphere*4.1;
    const quantile=THREE.MathUtils.clamp((sheet+0.5)/sheets+Math.sin(phase*3+seed)*0.08+Math.sin(phase*7-seed)*0.035,0.03,0.97);
    return auroraTrack(grid,i,hemisphere,quantile);
  });
  // Evaluate the full WMM on a bounded 4° lattice, then interpolate direction.
  // It inclines rays only: NOAA footprint coordinates are not magnetically rotated.
  const slopes=Array.from({length:90},(_,i)=>{
    const lat=tracks[i*4].latitude,lon=i*4,normal=new THREE.Vector3(...geodeticNormal(lat,lon));
    if(year<2025||year>=2030)return new THREE.Vector3();
    const field=new THREE.Vector3(...magneticField(lat,lon,120,year));
    if(field.dot(normal)<0)field.negate();
    const slope=field.divideScalar(Math.max(1,field.dot(normal))).sub(normal);
    return slope.clampLength(0,0.8);
  });
  for(let col=0;col<=columns;col++) {
    const lon=col/columns*360, sector=Math.floor(lon)%360, t=lon-Math.floor(lon);
    const latitude=THREE.MathUtils.lerp(tracks[sector].latitude,tracks[(sector+1)%360].latitude,t);
    // Fixed geographic seed; independent north/south folds. Fine motion is GPU
    // deformation, never regeneration of thousands of objects each frame.
    const phase=lon*Math.PI/180, folded=latitude+Math.sin(phase*9+sheet*2.17+hemisphere)*0.18+Math.sin(phase*23+sheet)*0.055;
    const fieldSector=lon/4,fieldIndex=Math.floor(fieldSector)%90,slope=slopes[fieldIndex].clone().lerp(slopes[(fieldIndex+1)%90],fieldSector-Math.floor(fieldSector));
    for(let row=0;row<=rows;row++) {
      const h=95000+row/rows*355000,index=(col*(rows+1)+row)*3;
      const p=new THREE.Vector3(...geodeticToWorld(folded,lon,h)).addScaledVector(slope,h/1000-120);
      const geo=worldToGeodetic(p.toArray());
      // Reproject along the field to preserve the exact requested physical height.
      points.set(geodeticToWorld(geo.latitude,geo.longitude,h),index); normals.set(geodeticNormal(folded,lon),index);
    }
  }
  return {points,normals};
}
/** Fixed resource topology; forecast updates morph existing buffers. */
export function buildAuroraCurtains(data: RadarAuroraData, material: THREE.ShaderMaterial, quality: "low"|"balanced"|"high") {
  const group=new THREE.Group(), grid=auroraField(data.samples);
  const date=new Date(data.observedAt??data.refreshedAt),year=date.getUTCFullYear()+(date.getTime()-Date.UTC(date.getUTCFullYear(),0,1))/(Date.UTC(date.getUTCFullYear()+1,0,1)-Date.UTC(date.getUTCFullYear(),0,1));
  const columns=quality==="high"?720:quality==="low"?180:360,rows=quality==="high"?24:quality==="low"?10:18,sheets=4;
  for(const hemisphere of [1,-1] as const) for(let sheet=0;sheet<sheets;sheet++) {
    const {points,normals}=trackPositions(grid,hemisphere,sheet,sheets,columns,rows,year),field=new Float32Array(points.length),indices:number[]=[];
    for(let col=0;col<=columns;col++) for(let row=0;row<=rows;row++) {
      const index=(col*(rows+1)+row)*3; field.set([col/columns*Math.PI*2,95+row/rows*355,sheet*2.17+hemisphere*4.1],index);
    }
    for(let col=0;col<columns;col++) for(let row=0;row<rows;row++) { const a=col*(rows+1)+row,b=a+rows+1; indices.push(a,b,a+1,b,b+1,a+1); }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.BufferAttribute(points,3));
    geometry.setAttribute("aNextPosition",new THREE.BufferAttribute(points.slice(),3));
    geometry.setAttribute("aNormal",new THREE.BufferAttribute(normals,3));
    geometry.setAttribute("aNextNormal",new THREE.BufferAttribute(normals.slice(),3));
    geometry.setAttribute("aField",new THREE.BufferAttribute(field,3)); geometry.setIndex(indices); geometry.computeBoundingSphere();
    geometry.boundingSphere!.radius+=500;
    const mesh=new THREE.Mesh(geometry,material); mesh.userData={hemisphere,sheet,sheets,columns,rows}; mesh.renderOrder=5; group.add(mesh);
  }
  return group;
}
export function updateAuroraCurtains(group: THREE.Group,data: RadarAuroraData,blend: number) {
  const grid=auroraField(data.samples);
  const date=new Date(data.observedAt??data.refreshedAt),year=date.getUTCFullYear()+(date.getTime()-Date.UTC(date.getUTCFullYear(),0,1))/(Date.UTC(date.getUTCFullYear()+1,0,1)-Date.UTC(date.getUTCFullYear(),0,1));
  for(const object of group.children) {
    const mesh=object as THREE.Mesh, {hemisphere,sheet,sheets,columns,rows}=mesh.userData;
    const next=trackPositions(grid,hemisphere,sheet,sheets,columns,rows,year), geometry=mesh.geometry;
    for(const [from,to,values] of [["position","aNextPosition",next.points],["aNormal","aNextNormal",next.normals]] as const) {
      const a=geometry.getAttribute(from) as THREE.BufferAttribute,b=geometry.getAttribute(to) as THREE.BufferAttribute;
      for(let i=0;i<a.array.length;i++) a.array[i]+=(b.array[i]-a.array[i])*blend;
      (b.array as Float32Array).set(values); a.needsUpdate=b.needsUpdate=true;
    }
    geometry.computeBoundingSphere(); geometry.boundingSphere!.radius+=500;
  }
}
