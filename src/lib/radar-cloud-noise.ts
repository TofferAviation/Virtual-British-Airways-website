/** Periodic gradient fBm plus independent cellular scales for volumetric mass
 * and erosion. These are inferred shapes, not satellite observations. */
function hash(x: number, y: number, z: number) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const wrap = (x: number, period: number) => ((x % period) + period) % period;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp = (x: number) => Math.max(0, Math.min(1, x));

export function periodicGradientNoise(x: number, y: number, z: number, period: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const gradient = (dx: number, dy: number, dz: number) => {
    const h = Math.floor(hash(wrap(ix + dx, period), wrap(iy + dy, period), wrap(iz + dz, period)) * 16);
    const a = h < 8 ? fx - dx : fy - dy;
    const b = h < 4 ? fy - dy : h === 12 || h === 14 ? fx - dx : fz - dz;
    return ((h & 1) ? -a : a) + ((h & 2) ? -b : b);
  };
  return mix(
    mix(mix(gradient(0, 0, 0), gradient(1, 0, 0), fade(fx)), mix(gradient(0, 1, 0), gradient(1, 1, 0), fade(fx)), fade(fy)),
    mix(mix(gradient(0, 0, 1), gradient(1, 0, 1), fade(fx)), mix(gradient(0, 1, 1), gradient(1, 1, 1), fade(fx)), fade(fy)),
    fade(fz),
  );
}

export function periodicCellularNoise(x: number, y: number, z: number, period: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let nearest = 4;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const a = wrap(ix + dx, period), b = wrap(iy + dy, period), c = wrap(iz + dz, period);
        const px = ix + dx + hash(a, b, c), py = iy + dy + hash(a + 19, b + 31, c + 7), pz = iz + dz + hash(a + 59, b + 13, c + 41);
        nearest = Math.min(nearest, (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2);
      }
  return clamp(1 - Math.sqrt(nearest));
}

export function bakeCloudNoise(size: number, detail = false) {
  const data = new Uint8Array(size ** 3 * 4);
  const scales = detail ? [3, 6, 12] : [4, 8, 16];
  let index = 0;
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        // Texels describe their centres, so wrapping interpolation is continuous.
        const u = (x + 0.5) / size, v = (y + 0.5) / size, w = (z + 0.5) / size;
        const gradient = 0.5 + 0.5 * (
          periodicGradientNoise(u * 4, v * 4, w * 4, 4) * 0.625 +
          periodicGradientNoise(u * 8, v * 8, w * 8, 8) * 0.25 +
          periodicGradientNoise(u * 16, v * 16, w * 16, 16) * 0.125
        );
        data[index++] = Math.round(clamp(gradient) * 255);
        for (const scale of scales)
          data[index++] = Math.round(periodicCellularNoise(u * scale, v * scale, w * scale, scale) * 255);
      }
  return data;
}
