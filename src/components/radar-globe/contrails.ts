import * as THREE from "three";
import { CONTRAIL_MAX_POINTS, CONTRAIL_PROFILES, contrailEngines } from "@/lib/radar-contrails";
import type { GlobeQuality } from "@/lib/radar-globe-quality";

export type ContrailSource={id:string;key:string;position:THREE.Vector3;rotation:THREE.Quaternion;selected:boolean;enabled:boolean;anchorBoost:number;history?:(seconds:number)=>Array<{position:THREE.Vector3;rotation:THREE.Quaternion;age:number}>};
type Point={position:THREE.Vector3;rotation:THREE.Quaternion;born:number;along:number;boost:number};
type Trail={mesh:THREE.Mesh;key:string;points:Point[];head:Point;lastPosition:THREE.Vector3;lastNow:number;lastSample:number;active:boolean;seed:number};
const RENDER_POINTS=CONTRAIL_MAX_POINTS*2;

/** One bounded, reusable ribbon mesh per aircraft; no sprites, downloads or cloud-cache invalidation. */
export class GlobeContrails {
  readonly group=new THREE.Group();
  private trails=new Map<string,Trail>();
  private engine=new THREE.Vector3();
  private tangent=new THREE.Vector3();
  private midpoint:Point={position:new THREE.Vector3(),rotation:new THREE.Quaternion(),born:0,along:0,boost:1};
  private enabled=false;
  private points=0;
  constructor(private material:THREE.Material) {}
  get stats(){return {enabled:this.enabled,aircraft:this.trails.size,points:this.points,draws:[...this.trails.values()].filter(t=>t.mesh.visible).length};}

  update(sources:readonly ContrailSource[],camera:THREE.Vector3,nowMs:number,quality:GlobeQuality,enabled:boolean) {
    this.enabled=enabled;this.points=0;
    if(!enabled){this.clear();return;}
    const now=nowMs/1000,profile=CONTRAIL_PROFILES[quality];
    const candidates=sources.filter(s=>(s.enabled||this.trails.has(s.id))&&contrailEngines(s.key).length&&camera.distanceToSquared(s.position)<1200**2)
      .sort((a,b)=>Number(b.selected)-Number(a.selected)||camera.distanceToSquared(a.position)-camera.distanceToSquared(b.position)).slice(0,profile.aircraft);
    const ids=new Set(candidates.map(s=>s.id));
    // Immediately release removed/filtered aircraft and downshift allocations.
    for(const [id,trail]of this.trails)if(!ids.has(id)){this.remove(id,trail);}
    for(const source of candidates){
      let trail=this.trails.get(source.id);
      if(trail&&trail.key!==source.key){this.remove(source.id,trail);trail=undefined;}
      if(!trail){
        trail=this.create(source,now);this.trails.set(source.id,trail);this.group.add(trail.mesh);
        for(const point of (source.history?.(profile.seconds)??[]).slice(-(CONTRAIL_MAX_POINTS-2))){
          const previous=trail.points.at(-1);
          trail.points.push({...point,born:now-point.age,boost:1,along:(previous?.along??0)+(previous?point.position.distanceTo(previous.position)*1000:0)});
        }
        if(trail.points.length){trail.head.along=trail.points.at(-1)!.along+source.position.distanceTo(trail.points.at(-1)!.position)*1000;this.rebuild(trail);}
      }
      const dt=now-trail.lastNow,travel=source.position.distanceTo(trail.lastPosition);
      const moving=dt>0&&dt<2&&travel/dt>.025&&travel/dt<1;
      // A tab suspension, teleport or reconnect must never produce a giant connecting streak.
      if(dt>2||travel>Math.max(1,dt)) {trail.points.length=0;trail.active=false;}
      trail.lastNow=now;trail.lastPosition.copy(source.position);
      const active=moving&&source.enabled;
      if(active){
        const previous=trail.points.at(-1);
        const along=(previous?.along??0)+(previous?source.position.distanceTo(previous.position)*1000:0);
        trail.head.position.copy(source.position);trail.head.rotation.copy(source.rotation);
        trail.head.born=now;trail.head.along=along;trail.head.boost=source.anchorBoost;
        if(!trail.active)trail.lastSample=-Infinity;
        if(now-trail.lastSample>=profile.interval){
          trail.points.push({position:source.position.clone(),rotation:source.rotation.clone(),born:now,along,boost:source.anchorBoost});
          trail.lastSample=now;
          if(trail.points.length>=CONTRAIL_MAX_POINTS)trail.points.shift();
          this.rebuild(trail);
        } else this.head(trail);
      }
      trail.active=active;
      const expired=trail.points.findIndex(p=>now-p.born<=profile.seconds);
      if(expired>0){trail.points.splice(0,expired);this.rebuild(trail);}
      if(expired<0&&trail.points.length){trail.points.length=0;trail.mesh.geometry.setDrawRange(0,0);}
      trail.mesh.visible=trail.points.length>1;
      this.points+=trail.points.length;
    }
  }

  private create(source:ContrailSource,now:number):Trail {
    const count=contrailEngines(source.key).length,vertices=RENDER_POINTS*count*2,geometry=new THREE.BufferGeometry();
    for(const [name,size]of [["position",3],["aTangent",3],["aBorn",1],["aAlong",1],["aSide",1],["aSeed",1]] as const)
      geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(vertices*size),size).setUsage(THREE.DynamicDrawUsage));
    const indices=new Uint16Array((RENDER_POINTS-1)*count*6);
    geometry.setIndex(new THREE.BufferAttribute(indices,1).setUsage(THREE.DynamicDrawUsage));geometry.setDrawRange(0,0);
    const mesh=new THREE.Mesh(geometry,this.material);mesh.layers.set(8);mesh.frustumCulled=false;
    mesh.renderOrder=4;mesh.visible=false;
    let seed=0;for(const c of source.id)seed=(seed*31+c.charCodeAt(0))>>>0;
    return {mesh,key:source.key,points:[],head:{position:source.position.clone(),rotation:source.rotation.clone(),born:now,along:0,boost:source.anchorBoost},lastPosition:source.position.clone(),lastNow:now,lastSample:-Infinity,active:false,seed:seed%997};
  }

  private write(trail:Trail,index:number,point:Point,tangent:THREE.Vector3) {
    const geometry=trail.mesh.geometry,anchors=contrailEngines(trail.key);
    for(let engine=0;engine<anchors.length;engine++){
      this.engine.fromArray(anchors[engine]).multiplyScalar(.001*point.boost).applyQuaternion(point.rotation).add(point.position).sub(trail.mesh.position);
      for(let side=0;side<2;side++){
        const v=(engine*RENDER_POINTS+index)*2+side;
        (geometry.getAttribute("position") as THREE.BufferAttribute).setXYZ(v,this.engine.x,this.engine.y,this.engine.z);
        (geometry.getAttribute("aTangent") as THREE.BufferAttribute).setXYZ(v,tangent.x,tangent.y,tangent.z);
        (geometry.getAttribute("aBorn") as THREE.BufferAttribute).setX(v,point.born);
        (geometry.getAttribute("aAlong") as THREE.BufferAttribute).setX(v,point.along);
        (geometry.getAttribute("aSide") as THREE.BufferAttribute).setX(v,side?1:-1);
        (geometry.getAttribute("aSeed") as THREE.BufferAttribute).setX(v,trail.seed+engine*17);
      }
    }
  }

  private rebuild(trail:Trail) {
    const geometry=trail.mesh.geometry,n=trail.points.length;
    trail.mesh.position.copy(trail.head.position);
    // Compact index ranges keep all engines in ONE draw call, without linking their strips.
    const indices=geometry.getIndex()!;let cursor=0;
    for(let engine=0;engine<contrailEngines(trail.key).length;engine++)for(let i=0;i<n;i++){
      const a=trail.points[i],b=trail.points[i+1]??trail.head;
      if(b.born-a.born>2)continue; // leave a real gap after an emission pause
      for(let half=0;half<2;half++){
        const v=(engine*RENDER_POINTS+i*2+half)*2;
        for(const value of [v,v+1,v+2,v+1,v+3,v+2])indices.setX(cursor++,value);
      }
    }
    geometry.setDrawRange(0,cursor);indices.needsUpdate=true;
    for(let i=0;i<=n;i++){
      const point=i===n?trail.head:trail.points[i];
      const previous=trail.points[Math.max(0,i-1)]??trail.head,next=trail.points[i+1]??trail.head;
      this.tangent.subVectors(next.position,previous.position);
      if(this.tangent.lengthSq()<1e-12)this.tangent.set(0,0,-1).applyQuaternion(point.rotation);
      this.write(trail,i*2,point,this.tangent);
      if(i<n){this.mid(trail,i);this.write(trail,i*2+1,this.midpoint,this.tangent);}
    }
    for(const attribute of Object.values(geometry.attributes)){(attribute as THREE.BufferAttribute).clearUpdateRanges();(attribute as THREE.BufferAttribute).needsUpdate=true;}
  }

  private mid(trail:Trail,i:number){
    const a=trail.points[i],b=trail.points[i+1]??trail.head;
    const previous=trail.points[Math.max(0,i-1)],next=trail.points[i+2]??trail.head;
    const p=a.born-previous.born>2?a:previous,q=next.born-b.born>2?b:next;
    // A bounded Catmull-Rom midpoint rounds report/sample corners. Only the
    // cosmetic wake bends; the authoritative aircraft path remains unchanged.
    this.midpoint.position.copy(a.position).add(b.position).multiplyScalar(.5)
      .addScaledVector(this.tangent.subVectors(b.position,p.position),.0625)
      .addScaledVector(this.tangent.subVectors(q.position,a.position),-.0625);
    this.midpoint.rotation.copy(a.rotation).slerp(b.rotation,.5);
    this.midpoint.born=(a.born+b.born)*.5;this.midpoint.along=(a.along+b.along)*.5;this.midpoint.boost=(a.boost+b.boost)*.5;
    this.tangent.subVectors(b.position,a.position);
  }

  private head(trail:Trail) {
    const n=trail.points.length;if(!n)return;
    this.tangent.subVectors(trail.head.position,trail.points[Math.max(0,n-2)].position);
    if(this.tangent.lengthSq()<1e-12)this.tangent.set(0,0,-1).applyQuaternion(trail.head.rotation);
    this.write(trail,n*2,trail.head,this.tangent);
    this.mid(trail,n-1);this.write(trail,n*2-1,this.midpoint,this.tangent);
    // Only the newest midpoint/tip per engine uploads each frame. Older knots stay anchored.
    const geometry=trail.mesh.geometry;
    for(const attribute of Object.values(geometry.attributes)){
      const a=attribute as THREE.BufferAttribute;a.clearUpdateRanges();
      for(let engine=0;engine<contrailEngines(trail.key).length;engine++)a.addUpdateRange((engine*RENDER_POINTS+n*2-1)*2*a.itemSize,4*a.itemSize);
      a.needsUpdate=true;
    }
  }

  private remove(id:string,trail:Trail){this.group.remove(trail.mesh);trail.mesh.geometry.dispose();this.trails.delete(id);}
  private clear(){for(const [id,trail]of this.trails)this.remove(id,trail);}
  dispose(){this.clear();this.group.clear();}
}
