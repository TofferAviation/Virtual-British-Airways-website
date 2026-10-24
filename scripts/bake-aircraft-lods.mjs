/** Offline map-scale meshes derived from the shipped GPLv2 aircraft, not
 * simulator assets. No network, browser, or model code is executed. */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import * as THREE from "three";
import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js";
import {mergeVertices} from "three/addons/utils/BufferGeometryUtils.js";
import {MeshoptSimplifier} from "three/addons/libs/meshopt_simplifier.module.js";
import sharp from "sharp";

const directory=fileURLToPath(new URL("../public/models/aircraft/",import.meta.url));
const manifest=JSON.parse(await readFile(path.join(directory,"manifest.json"),"utf8"));
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,options){this.type=type;Object.assign(this,options);}};
await MeshoptSimplifier.ready;
await mkdir(path.join(directory,"lod"),{recursive:true});
const results=[];
for(const model of manifest.models){
  const bytes=await readFile(path.join(directory,model.file)),length=bytes.readUInt32LE(12);
  const gltf=JSON.parse(bytes.toString("utf8",20,20+length)),binary=bytes.subarray(28+length);
  const images=await Promise.all((gltf.images??[]).map(async image=>{
    const view=gltf.bufferViews[image.bufferView];
    return sharp(binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength)).resize(256,256,{fit:"inside"}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  }));
  const originalMaterials=gltf.materials??[],textures=gltf.textures??[];
  gltf.buffers[0].uri=`data:application/octet-stream;base64,${binary.toString("base64")}`;
  gltf.materials=originalMaterials.map((m,i)=>({name:m.name,extras:{bavMaterial:i},pbrMetallicRoughness:{baseColorFactor:m.pbrMetallicRoughness?.baseColorFactor},doubleSided:m.doubleSided}));
  delete gltf.images;delete gltf.textures;delete gltf.samplers;
  const {scene}=await new GLTFLoader().parseAsync(JSON.stringify(gltf),"");
  scene.updateMatrixWorld(true);scene.traverse(object=>{if(object instanceof THREE.SkinnedMesh)object.skeleton.update();});
  const bounds=new THREE.Box3().setFromObject(scene,true),center=bounds.getCenter(new THREE.Vector3());
  const positions=[],normals=[],colours=[],point=new THREE.Vector3(),normal=new THREE.Vector3(),colour=new THREE.Color();
  scene.traverseVisible(mesh=>{
    if(!(mesh instanceof THREE.Mesh))return;
    const g=mesh.geometry,p=g.getAttribute("position"),n=g.getAttribute("normal"),uv=g.getAttribute("uv"),index=g.getIndex();
    const normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld),mirrored=mesh.matrixWorld.determinant()<0;
    for(let t=0;t<(index?.count??p.count);t+=3){
      const group=g.groups.find(group=>t>=group.start&&t<group.start+group.count);
      const material=Array.isArray(mesh.material)?mesh.material[group?.materialIndex??0]:mesh.material;
      const source=originalMaterials[material.userData.bavMaterial]??{},factor=source.pbrMetallicRoughness?.baseColorFactor??[1,1,1,1];
      if(factor[3]<.1)continue;
      const texture=source.pbrMetallicRoughness?.baseColorTexture,image=texture?images[textures[texture.index]?.source]:null;
      for(const j of mirrored?[0,2,1]:[0,1,2]){
        const vertex=index?index.getX(t+j):t+j;
        mesh.getVertexPosition(vertex,point);point.applyMatrix4(mesh.matrixWorld).sub(center);positions.push(...point.toArray());
        if(n)normal.fromBufferAttribute(n,vertex).applyNormalMatrix(normalMatrix);else normal.set(0,1,0);
        normals.push(...normal.toArray());colour.setRGB(factor[0],factor[1],factor[2]);
        if(image&&uv){
          const x=Math.min(image.info.width-1,Math.floor(((uv.getX(vertex)%1+1)%1)*image.info.width));
          const y=Math.min(image.info.height-1,Math.floor(((uv.getY(vertex)%1+1)%1)*image.info.height));
          const i=(y*image.info.width+x)*4;
          colour.multiply(new THREE.Color().setRGB(image.data[i]/255,image.data[i+1]/255,image.data[i+2]/255,THREE.SRGBColorSpace));
        }
        colours.push(...colour.toArray());
      }
    }
  });
  const raw=new THREE.BufferGeometry();
  for(const [name,array]of [["position",positions],["normal",normals],["color",colours]])raw.setAttribute(name,new THREE.Float32BufferAttribute(array,3));
  const welded=mergeVertices(raw,1e-4),p=welded.getAttribute("position"),n=welded.getAttribute("normal"),c=welded.getAttribute("color");
  const attributes=new Float32Array(p.count*6);
  for(let i=0;i<p.count;i++)attributes.set([n.getX(i),n.getY(i),n.getZ(i),c.getX(i),c.getY(i),c.getZ(i)],i*6);
  const [indices,error]=MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(welded.index.array),p.array,3,attributes,6,[.1,.1,.1,.005,.005,.005],null,7200,.01,["Permissive"]);
  const remap=new Map(),compact={position:[],normal:[],color:[]},output=[];
  for(const index of indices){
    if(!remap.has(index)){
      remap.set(index,remap.size);
      for(const [name,attribute]of [["position",p],["normal",n],["color",c]])compact[name].push(attribute.getX(index),attribute.getY(index),attribute.getZ(index));
    }
    output.push(remap.get(index));
  }
  const compactBounds=new THREE.Box3().setFromArray(compact.position),size=bounds.getSize(new THREE.Vector3()),reducedSize=compactBounds.getSize(new THREE.Vector3());
  if(size.distanceTo(reducedSize)>size.length()*.02||output.length/3>12000)throw Error(`${model.type}: LOD failed its shape/triangle budget: ${size.toArray()} -> ${reducedSize.toArray()}, ${output.length/3} triangles`);
  // Plain self-contained glTF 2.0: one mesh/material/draw, no runtime decoder or texture downloads.
  const chunks=[],views=[],accessors=[];let offset=0;
  const add=(array,componentType,type,count,min,max)=>{
    const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),index=views.length;
    chunks.push(data);views.push({buffer:0,byteOffset:offset,byteLength:data.length});offset+=data.length;
    if(offset%4){const padding=Buffer.alloc(4-offset%4);chunks.push(padding);offset+=padding.length;}
    accessors.push({bufferView:index,componentType,count,type,...min?{min,max}:{}});return accessors.length-1;
  };
  const position=add(new Float32Array(compact.position),5126,"VEC3",remap.size,compactBounds.min.toArray(),compactBounds.max.toArray());
  const normalIndex=add(new Float32Array(compact.normal),5126,"VEC3",remap.size),color=add(new Float32Array(compact.color),5126,"VEC3",remap.size);
  const index=add(new Uint32Array(output),5125,"SCALAR",output.length);
  const document={asset:{version:"2.0",generator:"BAV offline map LOD · meshoptimizer"},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:position,NORMAL:normalIndex,COLOR_0:color},indices:index,material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:.1,roughnessFactor:.65},doubleSided:true}],buffers:[{byteLength:offset}],bufferViews:views,accessors,extras:{license:"GPL-2.0",source:`../${model.file}`,revision:manifest.revision}};
  let json=Buffer.from(JSON.stringify(document));if(json.length%4)json=Buffer.concat([json,Buffer.alloc(4-json.length%4,32)]);
  const bin=Buffer.concat(chunks),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
  header.write("glTF");header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  binHeader.writeUInt32LE(bin.length,0);binHeader.writeUInt32LE(0x004e4942,4);
  const result=Buffer.concat([header,json,binHeader,bin]);await writeFile(path.join(directory,"lod",model.file),result);
  results.push({type:model.type,triangles:output.length/3,bytes:result.length,error});
  raw.dispose();welded.dispose();console.log(JSON.stringify(results.at(-1)));
}
await writeFile(path.join(directory,"lod","manifest.json"),JSON.stringify({revision:manifest.revision,license:"GPL-2.0",models:results},null,2)+"\n");
await writeFile(path.join(directory,"source","bake-aircraft-lods.mjs"),await readFile(fileURLToPath(import.meta.url)));
