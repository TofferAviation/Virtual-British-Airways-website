import * as THREE from "three";

// Reuse CPU data across preview presets; each scene owns its GPU textures.
const baked = new Map<boolean, Promise<Uint8Array>>();
export async function cloudNoiseTexture(detail = false) {
  const size = detail ? 32 : 64;
  let data = baked.get(detail);
  if (!data) {
    data = fetch(`/textures/clouds/${detail ? "detail-v1" : "mass-v1"}.rgba`)
      .then(async response => {
        if (!response.ok) throw new Error("Cloud noise asset unavailable");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length !== size ** 3 * 4) throw new Error("Incomplete cloud noise asset");
        return bytes;
      }).catch(error => { baked.delete(detail); throw error; });
    baked.set(detail, data);
  }
  const texture = new THREE.Data3DTexture(await data, size, size, size);
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
