/** Renderer-only reconstruction. The categorical source mask is never changed.
 * R/B: optical depth/top. Live G: interpolated confidence; A: donor validity.
 * The legacy support reconstruction uses G/A for distance/edge bits instead.
 * Raw observation flags are sampled separately with nearest-neighbour filtering. */
export const SATELLITE_EDGE_NEIGHBOURS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
] as const;

export function satelliteVolumeAvailable(flags: number) {
  const state = flags & 7;
  return (state === 3 || state === 4) && (flags & 24) === 0;
}

export const SATELLITE_SUPPORT_RANGE = 6;

/** Capped Euclidean distance to an unsupported cell centre, in display cells.
 * Two separable linear-time sweeps; longitude wraps, beyond either pole is
 * unsupported. Rebuilt on observations, not per rendered frame. */
export function satelliteSupportDistances(source: Uint8Array, width: number, height: number) {
  if (width < 1 || height < 1 || source.length !== width * height * 4) throw Error("Invalid satellite render grid");
  const distances = new Float32Array(width * height), cap = SATELLITE_SUPPORT_RANGE;
  for (let y = 0; y < height; y++) {
    let distance = cap;
    for (let x = -cap; x < width; x++) {
      const wrapped = (x % width + width) % width;
      distance = satelliteVolumeAvailable(source[(y * width + wrapped) * 4 + 3]) ? Math.min(cap, distance + 1) : 0;
      if (x >= 0) distances[y * width + x] = distance * distance;
    }
    distance = cap;
    for (let x = width + cap - 1; x >= 0; x--) {
      distance = satelliteVolumeAvailable(source[(y * width + x % width) * 4 + 3]) ? Math.min(cap, distance + 1) : 0;
      if (x < width) distances[y * width + x] = Math.min(distances[y * width + x], distance * distance);
    }
  }
  const n = height + 2, costs = new Float64Array(n), sites = new Int32Array(n), cuts = new Float64Array(n + 1);
  for (let x = 0; x < width; x++) {
    costs[0] = costs[n - 1] = 0;
    for (let y = 0; y < height; y++) costs[y + 1] = distances[y * width + x];
    let k = 0;
    sites[0] = 0; cuts[0] = -Infinity; cuts[1] = Infinity;
    // Lower envelope of (y-site)^2 + horizontalDistance^2.
    for (let q = 1; q < n; q++) {
      let p = sites[k], crossing = (costs[q] + q * q - costs[p] - p * p) / (2 * (q - p));
      while (crossing <= cuts[k]) {
        p = sites[--k];
        crossing = (costs[q] + q * q - costs[p] - p * p) / (2 * (q - p));
      }
      sites[++k] = q; cuts[k] = crossing; cuts[k + 1] = Infinity;
    }
    k = 0;
    for (let y = 0; y < height; y++) {
      const q = y + 1;
      while (cuts[k + 1] < q) k++;
      distances[y * width + x] = Math.min(cap, Math.sqrt((q - sites[k]) ** 2 + costs[sites[k]]));
    }
  }
  return distances;
}

export function buildSatelliteRenderTexture(source: Uint8Array, width: number, height: number, reconstructSupport = true, boundaryBandKm = 0) {
  if (width < 1 || height < 1 || source.length !== width * height * 4) throw Error("Invalid satellite render grid");
  const output = new Uint8Array(source.length), distances = reconstructSupport ? satelliteSupportDistances(source, width, height) : null;
  const index = (x: number, y: number) => y < 0 || y >= height ? -1 : (y * width + (x % width + width) % width) * 4;
  const available = (i: number) => i >= 0 && satelliteVolumeAvailable(source[i + 3]);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = index(x, y);
    let copy = available(i) ? i : -1, bestDistance = copy >= 0 ? 0 : 3, edges = 0;
    for (let n = 0; n < SATELLITE_EDGE_NEIGHBOURS.length && (reconstructSupport || copy < 0); n++) {
      const [dx, dy] = SATELLITE_EDGE_NEIGHBOURS[n], j = index(x + dx, y + dy);
      if (!available(j)) edges |= 1 << n;
      else if (dx * dx + dy * dy < bestDistance) { copy = j; bestDistance = dx * dx + dy * dy; }
    }
    // Observation-derived properties may be needed just outside a coarse
    // pixel, but ONLY where the independently bounded lobe field is positive.
    // This does not change raw mask classifications or fabricate retrievals.
    if (boundaryBandKm > 0 && copy < 0) {
      const northKm = 20015.114 / height, eastKm = 40030.228 / width * Math.max(.2,Math.cos((.5-(y+.5)/height)*Math.PI));
      const rx = Math.ceil(Math.min(10,boundaryBandKm) / eastKm) + 1;
      let nearest = Infinity;
      for (let dy=-1;dy<=1;dy++) for(let dx=-rx;dx<=rx;dx++) {
        const j=index(x+dx,y+dy),distance=Math.hypot(dx*eastKm,dy*northKm);
        if(available(j)&&distance<nearest){copy=j;nearest=distance;}
      }
    }
    if (copy >= 0) { output[i] = source[copy]; output[i + 2] = source[copy + 2]; }
    // Live G is continuous appearance confidence, never the categorical mask.
    // R/B retain retrieved optical depth/top. The original source is untouched.
    output[i+1]=distances?Math.round(distances[y*width+x]/SATELLITE_SUPPORT_RANGE*255):copy>=0?((source[copy+3]&7)===3?166:255):0;
    // Boundary flags are fetched with texelFetch, NEVER interpolated.
    output[i + 3] = reconstructSupport ? edges : boundaryBandKm > 0 && copy >= 0 ? 255 : 0;
  }
  // Padding alone grants no support. The footprint AND independent observed-
  // rectangle distance gate must both allow an explicitly estimated fringe.
  return output;
}

/** Reference for the independent, metric fringe cap in the shared shader.
 * Searches usable observed rectangles, not blurred class flags or a donor's
 * centre. The supported geographic grids are at least 0.1 degrees per cell. */
export function observedCloudDistance(source:Uint8Array,width:number,height:number,u:number,v:number){
  const px=((u%1+1)%1)*width,py=Math.max(0,Math.min(1-Number.EPSILON,v))*height;
  const x=Math.floor(px),y=Math.floor(py),fx=px-x,fy=py-y;
  const east=40030.228/width*Math.max(0,Math.cos((.5-v)*Math.PI)),north=20015.114/height;
  const rx=Math.min(7,Math.ceil(10/Math.max(.001,east)));
  let distance=Infinity;
  for(let dy=-1;dy<=1;dy++)for(let dx=-rx;dx<=rx;dx++){
    if(y+dy<0||y+dy>=height||!satelliteVolumeAvailable(source[((y+dy)*width+((x+dx)%width+width)%width)*4+3]))continue;
    distance=Math.min(distance,Math.hypot(Math.max(0,Math.abs(fx-dx-.5)-.5)*east,Math.max(0,Math.abs(fy-dy-.5)-.5)*north));
  }
  return distance;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function satelliteBoundaryEnvelope(distanceKm: number, widthKm: number, heightKm: number, depthKm: number, heightFraction: number) {
  return smooth(0, Math.max(.08, Math.min(8, Math.min(widthKm, heightKm) * .6)), distanceKm - depthKm * 1.2 * heightFraction ** 2);
}

/** Base/thickness remains an estimate, not an observed hidden cloud layer.
 * Opaque high clouds must not be squeezed into a sub-km cirrus-like slab. */
export function estimatedSatelliteThickness(topMetres: number, opticalDepth: number) {
  const tau = Math.max(0, opticalDepth);
  const deep = smooth(4, 16, tau) * smooth(5000, 10000, topMetres);
  const shallow = 350 + Math.sqrt(tau) * 220 + 400 * smooth(6500, 9500, topMetres) * (1 - deep);
  return Math.max(0, Math.min(topMetres - 100, shallow * (1 - deep) + (800 + Math.sqrt(tau) * 650) * deep));
}


/** Reference for the shader's inward-only rounded support boundary.
 * Adjacent unsupported sides form a convex corner, not a square min(x,y).
 * Radius is bounded to half a cell so supported shared edges remain joined. */
export function satelliteEdgeDistance(edges: number, x: number, y: number, widthKm: number, heightKm: number, cornerRadiusKm = 0) {
  const distances = [x * widthKm, (1 - x) * widthKm, y * heightKm, (1 - y) * heightKm,
    Math.hypot(x * widthKm, y * heightKm), Math.hypot((1 - x) * widthKm, y * heightKm),
    Math.hypot(x * widthKm, (1 - y) * heightKm), Math.hypot((1 - x) * widthKm, (1 - y) * heightKm)];
  let distance = distances.reduce((distance, value, n) => edges & (1 << n) ? Math.min(distance, value) : distance, 1e6);
  const radius = Math.max(0, Math.min(cornerRadiusKm, widthKm * .5, heightKm * .5));
  if (radius > 0) for (const [a, b] of [[0, 2], [1, 2], [0, 3], [1, 3]]) {
    if ((edges & (1 << a)) && (edges & (1 << b))) {
      const qx = radius - distances[a], qy = radius - distances[b];
      distance = Math.min(distance, radius - Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - Math.min(Math.max(qx, qy), 0));
    }
  }
  return distance;
}

export const satelliteAppearanceGLSL = `
float satelliteSupportDistance(float encodedDistance,vec2 cellKm){
  return (encodedDistance*${SATELLITE_SUPPORT_RANGE.toFixed(1)}-0.5)*min(cellKm.x,cellKm.y);
}
float satelliteBoundaryEnvelope(float distanceKm,vec2 cellKm,float depth,float t){
  // Shape the formation itself instead of leaving a fully dense vertical
  // wall under a thin alpha fade. Upper shoulders retreat inside the mask.
  float shoulder=depth*1.2*t*t;
  return smoothstep(0.0,max(0.08,min(8.0,min(cellKm.x,cellKm.y)*0.6)),distanceKm-shoulder);
}
float satelliteEstimatedThickness(float top,float opticalDepth){
  float deep=smoothstep(4.0,16.0,opticalDepth)*smoothstep(5.0,10.0,top);
  float shallow=0.350+sqrt(opticalDepth)*0.220+0.400*smoothstep(6.5,9.5,top)*(1.0-deep);
  return max(0.0,min(top-0.1,mix(shallow,0.800+sqrt(opticalDepth)*0.650,deep)));
}
float satelliteEdgeDistance(int edges,vec2 within,vec2 cellKm,float cornerRadiusKm){
  vec2 nearSide=within*cellKm,farSide=(1.0-within)*cellKm;
  vec4 sides=vec4(float(edges&1),float((edges>>1)&1),float((edges>>2)&1),float((edges>>3)&1));
  vec4 cardinal=mix(vec4(1e6),vec4(nearSide.x,farSide.x,nearSide.y,farSide.y),sides);
  float radius=clamp(cornerRadiusKm,0.0,min(cellKm.x,cellKm.y)*0.5);
  vec4 rounded=vec4(sides.x*sides.z,sides.y*sides.z,sides.x*sides.w,sides.y*sides.w)*step(0.00001,radius);
  // Reuse the four existing corner lengths: no new texture reads or noise.
  vec4 lengths=vec4(
    length(mix(nearSide,max(vec2(radius)-nearSide,vec2(0.0)),rounded.x)),
    length(mix(vec2(farSide.x,nearSide.y),max(vec2(radius)-vec2(farSide.x,nearSide.y),vec2(0.0)),rounded.y)),
    length(mix(vec2(nearSide.x,farSide.y),max(vec2(radius)-vec2(nearSide.x,farSide.y),vec2(0.0)),rounded.z)),
    length(mix(farSide,max(vec2(radius)-farSide,vec2(0.0)),rounded.w)));
  vec4 diagonal=vec4(float((edges>>4)&1),float((edges>>5)&1),float((edges>>6)&1),float((edges>>7)&1));
  vec4 interior=vec4(min(nearSide.x,nearSide.y),min(farSide.x,nearSide.y),min(nearSide.x,farSide.y),min(farSide.x,farSide.y));
  vec4 roundedDistance=vec4(radius)-lengths-min(vec4(radius)-interior,vec4(0.0));
  vec4 corners=mix(vec4(1e6),mix(lengths,roundedDistance,rounded),max(diagonal,rounded));
  return min(min(min(cardinal.x,cardinal.y),min(cardinal.z,cardinal.w)),min(min(corners.x,corners.y),min(corners.z,corners.w)));
}
`;
