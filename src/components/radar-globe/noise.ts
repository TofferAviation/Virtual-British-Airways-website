import * as THREE from "three";
import { bakeCloudNoise } from "@/lib/radar-cloud-noise";

// Reuse CPU data across preview presets; each scene owns its GPU textures.
const baked = new Map<boolean, Uint8Array>();
export function cloudNoiseTexture(detail = false) {
  const size = detail ? 32 : 64;
  let data = baked.get(detail);
  if (!data) {
    data = bakeCloudNoise(size, detail);
    baked.set(detail, data);
  }
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
