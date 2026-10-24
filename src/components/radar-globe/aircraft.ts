import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { aircraftFrame, aircraftDisplay, aircraftAboveHorizon, flightAltitudeMetres, resolveAircraftModel, type AircraftModel } from "@/lib/radar-aircraft";
import { geodeticToWorld } from "@/lib/radar-globe-geodesy";
import { AircraftMotion, type AircraftMotionReport } from "@/lib/radar-aircraft-motion";

type Entry = { root: THREE.Group; icon: THREE.Mesh; model: THREE.Group | null; lod: THREE.Group | null; spec: AircraftModel | null; selected: boolean; physical: boolean; motion:AircraftMotion };
type Cached = { prototype: THREE.Group; used: number };
type AircraftFlight = {id: string; aircraft: string; lastSnapshot: AircraftMotionReport | null; recentSnapshots?:readonly AircraftMotionReport[]; motion?:"instant"};

/** Shared assets, bounded cache and distance LOD. No simulator assets or remote hotlinks. */
export class GlobeAircraft {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  private cache = new Map<string, Cached>();
  private mapCache = new Map<string, THREE.Group>();
  private pending = new Set<string>();
  private failed = new Set<string>();
  private icons = new Map<string, THREE.BufferGeometry>();
  private normal = new THREE.MeshBasicMaterial({ color: 0xf2c84b, side: THREE.DoubleSide });
  private selected = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  private disposed = false;
  private clock = 0;
  private lastModelScan = -Infinity;
  private basis = new THREE.Matrix4();
  private right=new THREE.Vector3();
  private up=new THREE.Vector3();
  private back=new THREE.Vector3();
  private previousPosition=new THREE.Vector3();
  private previousRotation=new THREE.Quaternion();
  private depthRevision=0;
  physicalMoving=false;
  private revision=0;
  constructor(private loader:Pick<GLTFLoader,"loadAsync">=new GLTFLoader()) {}
  get stats() { return { aircraft: this.entries.size, loaded: this.cache.size, mapLoaded: this.mapCache.size, loading: this.pending.size, failed: [...this.failed], revision:this.revision, depthRevision:this.depthRevision, moving:this.physicalMoving, detailed: [...this.entries.values()].filter(e=>e.physical).length, highDetail:[...this.entries.values()].filter(e=>e.model?.visible).length, mapModels:[...this.entries.values()].filter(e=>e.lod?.visible&&!e.physical).length }; }
  get pickable() { return [...this.entries.values()].map(e => e.root); }

  private icon(spec: AircraftModel | null) {
    const key = spec?.key ?? "unknown";
    let geometry = this.icons.get(key);
    if (!geometry) {
      const span = (spec?.spanM ?? 36) / (spec?.lengthM ?? 40) / 2;
      const shape = new THREE.Shape();
      // Original aircraft silhouette, not a triangle and not an unlicensed model.
      const outline = [[0,-.5],[.035,-.38],[.05,-.08],[span,.14],[span,.2],[.05,.08],[.035,.35],[span*.35,.43],[span*.35,.48],[0,.42],[-span*.35,.48],[-span*.35,.43],[-.035,.35],[-.05,.08],[-span,.2],[-span,.14],[-.05,-.08],[-.035,-.38]];
      outline.forEach(([x,y],i) => i ? shape.lineTo(x,y) : shape.moveTo(x,y)); shape.closePath();
      geometry = new THREE.ShapeGeometry(shape); geometry.rotateX(Math.PI / 2);
      this.icons.set(key, geometry);
    }
    return geometry;
  }

  sync(flights: AircraftFlight[], selectedId: string,now=performance.now(),utc=Date.now()) {
    const alive = new Set<string>();
    for (const flight of flights) {
      const p = flight.lastSnapshot, height = p ? flightAltitudeMetres(p) : null;
      if (!p || height === null || !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude)>90 || Math.abs(p.longitude)>180) continue;
      alive.add(flight.id);
      const spec = resolveAircraftModel(flight.aircraft);
      let entry = this.entries.get(flight.id);
      if (entry && entry.spec?.key !== spec?.key) { this.group.remove(entry.root); this.entries.delete(flight.id); entry = undefined; }
      if (!entry) {
        const root = new THREE.Group(), icon = new THREE.Mesh(this.icon(spec), this.normal);
        root.add(icon); root.userData = { kind: "flight", id: flight.id };
        this.group.add(root); entry = { root, icon, model: null, lod:null, spec, selected: false, physical:false, motion:new AircraftMotion() }; this.entries.set(flight.id, entry);
      }
      entry.spec=spec; entry.selected = flight.id === selectedId; entry.icon.material = entry.selected ? this.selected : this.normal;
      entry.root.userData.aircraft = spec ? `${spec.label}${spec.match === "family" ? " · family substitute" : ""}` : `${flight.aircraft} · generic marker`;
      entry.motion.sync({...p,headingDeg:Number.isFinite(p.headingDeg)?p.headingDeg:0},flight.recentSnapshots??[],now,utc,flight.motion==="instant");
      this.pose(entry,now);
    }
    for (const [id,entry] of this.entries) if (!alive.has(id)) { this.group.remove(entry.root); this.entries.delete(id); }
  }

  update(cameraLocal: THREE.Vector3, fov: number, pixelsHigh: number, now: number, frustum: THREE.Frustum,closeScale?:number) {
    this.physicalMoving=false;
    const scan = now - this.lastModelScan > 350;
    if (scan) this.lastModelScan=now;
    const candidates: Array<{entry: Entry; range: number; highDetail:boolean}> = [];
    for (const entry of this.entries.values()) {
      this.previousPosition.copy(entry.root.position);this.previousRotation.copy(entry.root.quaternion);
      this.pose(entry,now);
      const moved=this.previousPosition.distanceToSquared(entry.root.position)>1e-16||1-Math.abs(this.previousRotation.dot(entry.root.quaternion))>1e-12;
      const range = Math.max(.001,cameraLocal.distanceTo(entry.root.position));
      const display=aircraftDisplay(entry.spec?.lengthM??40,range,fov,pixelsHigh,entry.selected,closeScale);
      const visible=frustum.containsPoint(entry.root.position)&&aircraftAboveHorizon(cameraLocal.toArray(),entry.root.position.toArray());
      if (visible && entry.spec && scan) candidates.push({entry,range,highDetail:display.highDetail});
      if (entry.spec && this.cache.has(entry.spec.key)) {
        const cached = this.cache.get(entry.spec.key)!;
        if (!entry.model) { entry.model=cached.prototype.clone(true); entry.root.add(entry.model); }
        if (visible&&display.highDetail) cached.used=++this.clock;
      }
      if(entry.spec&&!entry.lod&&this.mapCache.has(entry.spec.key)){entry.lod=this.mapCache.get(entry.spec.key)!.clone(true);entry.root.add(entry.lod);}
      const model=display.highDetail&&entry.model?entry.model:entry.lod;
      entry.physical=visible&&!!model&&!display.mapOverlay;
      if(entry.physical&&moved)this.physicalMoving=true;
      for(const object of [entry.model,entry.lod])if(object){
        object.visible=visible&&object===model;object.scale.setScalar(display.scale);
        object.traverse(part=>{part.layers.set(object.visible?(display.mapOverlay?6:0):7);if(object.visible&&!display.mapOverlay)part.layers.enable(5);});
      }
      // Generic/temporary fallback only: a supported, loaded type always uses a 3D mesh.
      entry.icon.visible=visible&&!model;
      entry.icon.layers.set(entry.icon.visible?6:7);
      entry.icon.scale.setScalar((entry.spec?.lengthM??40)*display.scale);
    }
    // Only moving, visible world-scale aircraft invalidate cloud depth. Distant
    // overlay traffic keeps the cheap cached cloud pass even while flying.
    if(this.physicalMoving)this.depthRevision++;
    if (scan) {
      candidates.sort((a,b) => Number(b.entry.selected)-Number(a.entry.selected) || a.range-b.range);
      // Load tiny map LODs first. Only request detailed textures/geometry when
      // they are large enough on screen to be useful, with two shared transfers.
      for(const {entry}of candidates)if(entry.spec)this.request(entry.spec.key,true);
      for(const {entry,highDetail}of candidates.slice(0,4))if(entry.spec&&highDetail)this.request(entry.spec.key,false);
    }
  }

  private pose(entry:Entry,now:number) {
    const p=entry.motion.sample(now);
    entry.root.position.set(...geodeticToWorld(p.latitude,p.longitude,p.altitudeFt*.3048));
    const frame=aircraftFrame(p.latitude,p.longitude,p.headingDeg);
    entry.root.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.right.fromArray(frame.right),this.up.fromArray(frame.up),this.back.fromArray(frame.back)));
  }

  displayedPose(id:string,now=performance.now()) {return this.entries.get(id)?.motion.sample(now);}

  closestDistance(cameraLocal: THREE.Vector3) {
    let distance=Infinity;
    for(const entry of this.entries.values())distance=Math.min(distance,cameraLocal.distanceTo(entry.root.position));
    return distance;
  }

  private request(key: string,mapLod:boolean) {
    const id=`${mapLod?"map":"detail"}:${key}`;
    if(this.disposed||(mapLod?this.mapCache.has(key):this.cache.has(key))||this.pending.has(id)||this.failed.has(id)||this.pending.size>=2)return;
    this.pending.add(id);
    void this.loader.loadAsync(`/models/aircraft/${mapLod?"lod/":""}${key}.glb`).then(gltf=>{
      if(this.disposed){disposeModel(gltf.scene);return;}
      this.revision++;
      if(mapLod){this.mapCache.set(key,gltf.scene);return;}
      const prototype=prepareAircraftModel(gltf.scene);
      this.cache.set(key,{prototype,used:++this.clock});
      // At most six fleet types resident. Detach shared clones before an LRU eviction.
      if(this.cache.size>6){
        const removable=[...this.cache].filter(([k])=>k!==key).sort((a,b)=>a[1].used-b[1].used);
        for(const [old,cached] of removable){
          if(this.cache.size<=6)break;
          for(const entry of this.entries.values())if(entry.spec?.key===old&&entry.model){entry.root.remove(entry.model);entry.model=null;}
          disposeModel(cached.prototype);this.cache.delete(old);
        }
      }
    }).catch(error=>{this.failed.add(id);console.warn(`Aircraft model ${id} could not load; retaining the available LOD or temporary marker`,error);}).finally(()=>this.pending.delete(id));
  }

  dispose() {
    this.disposed=true;
    for(const cached of this.cache.values())disposeModel(cached.prototype);
    for(const cached of this.mapCache.values())disposeModel(cached);
    for(const geometry of this.icons.values())geometry.dispose();
    this.normal.dispose();this.selected.dispose();this.group.clear();this.entries.clear();this.cache.clear();this.mapCache.clear();
  }
}

/** Flatten a static traffic pose once per type, batching compatible parts by material. Geometry/textures stay shared. */
export function prepareAircraftModel(source: THREE.Group) {
  source.updateMatrixWorld(true);
  source.traverse(object=>{if(object instanceof THREE.SkinnedMesh)object.skeleton.update();});
  const box=new THREE.Box3().setFromObject(source,true),center=box.getCenter(new THREE.Vector3());
  const result=new THREE.Group(),batches=new Map<THREE.Material,THREE.BufferGeometry[]>(),originals=new Set<THREE.BufferGeometry>();
  source.traverseVisible(object=>{
    if(object instanceof THREE.Line || object instanceof THREE.Points){
      const copy=object.clone(false);copy.geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
      copy.geometry.translate(-center.x,-center.y,-center.z);
      copy.position.set(0,0,0);copy.quaternion.identity();copy.scale.setScalar(1);copy.updateMatrix();
      result.add(copy);originals.add(object.geometry);return;
    }
    if(!(object instanceof THREE.Mesh)||!object.visible)return;
    const material=object.material;
    // Preserve multi-material groups rather than merging their texture assignments incorrectly.
    if(Array.isArray(material)){
      const geometry=bakeTrafficPose(object);geometry.translate(-center.x,-center.y,-center.z);
      result.add(new THREE.Mesh(geometry,material));originals.add(object.geometry);return;
    }
    const cloned=bakeTrafficPose(object);
    const geometry=cloned.index?cloned.toNonIndexed():cloned;
    if(geometry!==cloned)cloned.dispose();
    geometry.translate(-center.x,-center.y,-center.z);
    if(!geometry.getAttribute("normal"))geometry.computeVertexNormals();
    for(const name of Object.keys(geometry.attributes))if(!["position","normal","uv"].includes(name))geometry.deleteAttribute(name);
    if(!geometry.getAttribute("uv"))geometry.setAttribute("uv",new THREE.BufferAttribute(new Float32Array(geometry.getAttribute("position").count*2),2));
    // Convert interleaved attributes before mergeGeometries.
    for(const name of Object.keys(geometry.attributes)){
      const a=geometry.getAttribute(name),array=new Float32Array(a.count*a.itemSize);
      for(let i=0;i<a.count;i++)for(let j=0;j<a.itemSize;j++)array[i*a.itemSize+j]=a.getComponent(i,j);
      geometry.setAttribute(name,new THREE.BufferAttribute(array,a.itemSize));
    }
    const group=batches.get(material)??[];group.push(geometry);batches.set(material,group);originals.add(object.geometry);
  });
  for(const [material,geometries]of batches){
    const geometry=mergeGeometries(geometries);
    if(geometry){result.add(new THREE.Mesh(geometry,material));geometries.forEach(g=>g.dispose());}
    else for(const g of geometries)result.add(new THREE.Mesh(g,material));
  }
  originals.forEach(g=>g.dispose());
  result.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Line||object instanceof THREE.Points)object.layers.enable(5);});
  result.name="Type-matched traffic aircraft · original house livery";
  return result;
}

/** Retain default morph/skinned poses and mirrored winding when flattening scene nodes. */
function bakeTrafficPose(mesh: THREE.Mesh) {
  const geometry=mesh.geometry.clone();
  if(mesh instanceof THREE.SkinnedMesh || mesh.morphTargetInfluences?.some(weight=>weight!==0)){
    const position=geometry.getAttribute("position"),values=new Float32Array(position.count*3),point=new THREE.Vector3();
    for(let i=0;i<position.count;i++){mesh.getVertexPosition(i,point);point.toArray(values,i*3);}
    geometry.setAttribute("position",new THREE.BufferAttribute(values,3));geometry.computeVertexNormals();
  }
  geometry.morphAttributes={};geometry.morphTargetsRelative=false;
  geometry.applyMatrix4(mesh.matrixWorld);
  if(mesh.matrixWorld.determinant()<0){
    const indices=geometry.getIndex();
    if(indices){for(let i=0;i<indices.count;i+=3){const b=indices.getX(i+1);indices.setX(i+1,indices.getX(i+2));indices.setX(i+2,b);}}
    else for(const attribute of Object.values(geometry.attributes))for(let i=0;i<attribute.count;i+=3)for(let c=0;c<attribute.itemSize;c++){
      const b=attribute.getComponent(i+1,c);attribute.setComponent(i+1,c,attribute.getComponent(i+2,c));attribute.setComponent(i+2,c,b);
    }
  }
  return geometry;
}

function disposeModel(group: THREE.Object3D) {
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  group.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Line||object instanceof THREE.Points){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
  for(const material of materials){for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);material.dispose();}
  geometries.forEach(g=>g.dispose());
  const images=new Set<{close?:()=>void}>();
  textures.forEach(texture=>{if(texture.image)images.add(texture.image);texture.dispose();});
  images.forEach(image=>image.close?.());
}
