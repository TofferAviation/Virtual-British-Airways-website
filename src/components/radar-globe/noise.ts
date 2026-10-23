import * as THREE from "three";

function hash(x: number, y: number, z: number) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
function valueNoise(x: number, y: number, z: number, period: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z),
    fx = x - ix,
    fy = y - iy,
    fz = z - iz;
  const f = (t: number) => t * t * (3 - 2 * t),
    mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const at = (dx: number, dy: number, dz: number) =>
    hash((ix + dx) % period, (iy + dy) % period, (iz + dz) % period);
  return mix(
    mix(
      mix(at(0, 0, 0), at(1, 0, 0), f(fx)),
      mix(at(0, 1, 0), at(1, 1, 0), f(fx)),
      f(fy),
    ),
    mix(
      mix(at(0, 0, 1), at(1, 0, 1), f(fx)),
      mix(at(0, 1, 1), at(1, 1, 1), f(fx)),
      f(fy),
    ),
    f(fz),
  );
}
function worley(x: number, y: number, z: number, period: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  let distance = 4;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const a = (ix + dx + period) % period,
          b = (iy + dy + period) % period,
          c = (iz + dz + period) % period;
        const px = ix + dx + hash(a, b, c),
          py = iy + dy + hash(a + 19, b + 31, c + 7),
          pz = iz + dz + hash(a + 59, b + 13, c + 41);
        distance = Math.min(
          distance,
          (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2,
        );
      }
  return Math.max(0, 1 - Math.sqrt(distance));
}
/** Seamless value/Worley base plus cellular erosion; geographic placement is
 * supplied separately by GFS. The procedural detail is not observed weather. */
export function cloudNoiseTexture(detail = false) {
  const size = 48,
    data = new Uint8Array(size ** 3);
  let i = 0;
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const fx = x / size,
          fy = y / size,
          fz = z / size;
        const cellular = worley(fx * 8, fy * 8, fz * 8, 8);
        const value = detail
          ? cellular
          : valueNoise(fx * 4, fy * 4, fz * 4, 4) * 0.55 +
            cellular * 0.3 +
            valueNoise(fx * 12, fy * 12, fz * 12, 12) * 0.15;
        data[i++] = Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
      }
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RedFormat;
  texture.type = THREE.UnsignedByteType;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
