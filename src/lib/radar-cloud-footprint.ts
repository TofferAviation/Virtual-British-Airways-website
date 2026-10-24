/** Observation-constrained, sub-grid cloud masses. Not a cloud detector or
 * fluid solver: the mask plus its labelled uncertainty band bounds the region.
 * Inscribed, jittered ellipses merge into curved banks at several scales. */
export const CLOUD_FOOTPRINT_RANGE = 1.5;
export const CLOUD_BOUNDARY_BAND_KM = 10;
export type CloudFootprint = { width: number; height: number; pixels: Uint8Array; sourceWidth: number; sourceHeight: number; lobes: number };
export type CloudFootprintRequest = { id: number; width: number; height: number; scale: number; pixels: Uint8Array };
export type CloudFootprintResponse = CloudFootprint & { id: number; properties: Uint8Array; error?: string };

const available = (flags: number) => ((flags & 7) === 3 || (flags & 7) === 4) && !(flags & 24);
const random = (x: number, y: number, salt: number) => {
  let value = Math.imul(x + 13, 1597334677) ^ Math.imul(y + 31, 3812015801) ^ Math.imul(salt + 7, 1103515245);
  value = Math.imul(value ^ value >>> 16, 2246822507);
  return ((value ^ value >>> 13) >>> 0) / 4294967296;
};
const growthAt = (x: number, y: number) => {
  const gx = x / 2.7, gy = y / 2.7, ix = Math.floor(gx), iy = Math.floor(gy);
  const fx = gx - ix, fy = gy - iy, tx = fx * fx * (3 - 2 * fx), ty = fy * fy * (3 - 2 * fy);
  const a = random(ix,iy,71) * (1-tx) + random(ix+1,iy,71) * tx;
  const b = random(ix,iy+1,71) * (1-tx) + random(ix+1,iy+1,71) * tx;
  const t = Math.max(0,Math.min(1,(a*(1-ty)+b*ty-.2)/.6));
  return t*t*(3-2*t);
};

export function buildCloudFootprint(source: Uint8Array, width: number, height: number, scale = 4, boundaryBandKm = 0): CloudFootprint {
  if (![1, 2, 4].includes(scale) || width < 1 || height < 1 || width * height > 6_480_000 || source.length !== width * height * 4) throw Error("Invalid cloud footprint grid");
  const outWidth = width * scale, outHeight = height * scale, pixels = new Uint8Array(outWidth * outHeight);
  const boundaryBand = Math.max(0,Math.min(CLOUD_BOUNDARY_BAND_KM,boundaryBandKm)) / (20015.114 / height);
  const supported = (x: number, y: number) => y >= 0 && y < height && available(source[(y * width + (x % width + width) % width) * 4 + 3]);
  let lobes = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (!available(source[i + 3])) continue;
    const eastScale = Math.max(.2, Math.cos((.5 - (y + .5) / height) * Math.PI));
    const opticalDepth = Math.expm1(source[i] / 255 * Math.log(161));
    const fibrous = source[i + 2] > 70 && opticalDepth < 2;
    const growth = growthAt((x+.5)*eastScale,y+.5);
    for (let part = 0; part < 2; part++) {
      const salt = part * 11, angleIndex = Math.floor(random(x,y,salt+1)*16), angle = angleIndex*Math.PI/8;
      const cx = x + .5 + (random(x, y, salt + 2) - .5) * .32;
      const cy = y + .5 + (random(x, y, salt + 3) - .5) * .32;
      let safe = 1.3 + random(x, y, salt + 4) * .9;
      const rx = Math.ceil(safe / eastScale + 1), ry = Math.ceil(safe + 1);
      // Distance from this point to unsupported rectangles, not centres.
      // Before adding the explicitly authorised band, this enclosing circle
      // stays inside usable observations, including retrieval/provider gaps.
      for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
        if (supported(x + dx, y + dy)) continue;
        const ex = Math.max(0, Math.abs(x + dx + .5 - cx) - .5) * eastScale;
        const ey = Math.max(0, Math.abs(y + dy + .5 - cy) - .5);
        safe = Math.min(safe, Math.hypot(ex, ey));
      }
      // Coherent growth varies over several cells; a uniformly filled row of
      // same-size puffs still traces a straight satellite-grid fence.
      // Seed geometry does not change with lookup LOD. Cubic reconstruction
      // and an independent observed-distance cap govern the final boundary.
      const radius = (safe + boundaryBand - .01) * (.2 + .75 * growth) * (.85 + .15 * random(x, y, salt + 5));
      if (radius < .06) continue;
      const aspect = fibrous ? .25 : .68 + random(x, y, salt + 6) * .3;
      const minor = radius * aspect, ca = Math.cos(angle), sa = Math.sin(angle);
      // Only a narrow negative band is needed for smooth zero crossings.
      const extent = radius + .35;
      const x0 = Math.floor((cx - extent / eastScale) * scale), x1 = Math.ceil((cx + extent / eastScale) * scale);
      const y0 = Math.max(0, Math.floor((cy - extent) * scale)), y1 = Math.min(outHeight, Math.ceil((cy + extent) * scale));
      for (let yy = y0; yy < y1; yy++) {
        const north = (yy + .5) / scale - cy;
        for (let xx = x0; xx < x1; xx++) {
          const east = ((xx + .5) / scale - cx) * eastScale;
          const u = (east * ca + north * sa) / radius, v = (-east * sa + north * ca) / minor;
          const distance = (1 - Math.hypot(u, v)) * minor;
          const encoded = Math.max(0, Math.min(255, Math.round(128 + distance / CLOUD_FOOTPRINT_RANGE * 127)));
          const index = yy * outWidth + (xx % outWidth + outWidth) % outWidth;
          if (encoded > pixels[index]) pixels[index] = encoded;
        }
      }
      lobes++;
    }
  }
  return { width: outWidth, height: outHeight, pixels, sourceWidth:width, sourceHeight:height, lobes };
}

/** Cubic B-spline reference: continuous values AND derivatives across lookup
 * cells. The independent donor-rectangle gate bounds the estimated fringe. */
export function sampleCloudFootprint(field: CloudFootprint, u: number, v: number) {
  const x = ((u % 1 + 1) % 1) * field.width - .5, y = Math.max(0,Math.min(1,v)) * field.height - .5;
  const ix = Math.floor(x), iy = Math.floor(y);
  const weights=(f:number)=>[(1-f)**3/6,(3*f**3-6*f*f+4)/6,(-3*f**3+3*f*f+3*f+1)/6,f**3/6];
  const wx=weights(x-ix),wy=weights(y-iy);
  let value=0;
  for(let yy=0;yy<4;yy++)for(let xx=0;xx<4;xx++)value+=wx[xx]*wy[yy]*field.pixels[Math.max(0,Math.min(field.height-1,iy+yy-1))*field.width+((ix+xx-1)%field.width+field.width)%field.width];
  return value;
}
