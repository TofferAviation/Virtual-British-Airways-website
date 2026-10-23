import * as THREE from "three";
import { auroraField, auroraTrack } from "@/lib/radar-aurora-field";
import { AURORA_DETAIL, auroraArc, auroraNoise, type AuroraDetail } from "@/lib/radar-aurora-shape";
import { geodeticNormal, geodeticToWorld, worldToGeodetic } from "@/lib/radar-globe-geodesy";
import { magneticField } from "@/lib/radar-aurora-magnetic";
import type { RadarAuroraData } from "@/lib/radar-external";

function decimalYear(data: RadarAuroraData|null) {
  const date = new Date(data?.observedAt ?? data?.refreshedAt ?? Date.now()), year = date.getUTCFullYear();
  return year + (date.getTime() - Date.UTC(year, 0, 1)) / (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1));
}
type Arc = ReturnType<typeof auroraArc>;
function boundMorph(geometry: THREE.BufferGeometry) {
  const box = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute("position") as THREE.BufferAttribute);
  const next = geometry.getAttribute("aNextPosition"), point = new THREE.Vector3();
  for (let i = 0; i < next.count; i++) box.expandByPoint(point.fromBufferAttribute(next, i));
  // Union of both endpoints includes every interpolated chord. The padding
  // covers the GPU's bounded folds, height correction and upper-curtain shear.
  geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  geometry.boundingSphere.radius += 150;
}
function trackPositions(grid: Uint8Array, hemisphere: 1 | -1, arcs: Arc[], columns: number, rows: number, year: number) {
  const count = arcs.length * (columns + 1) * (rows + 1);
  const points = new Float32Array(count * 3), normals = new Float32Array(count * 3), field = new Float32Array(count * 3), shape = new Float32Array(count * 4);
  arcs.forEach((arc, arcIndex) => {
    const slopeStep = 4;
    const track = (u: number) => {
      const lon = arc.centre + (u - .5) * arc.span;
      const quantile = THREE.MathUtils.clamp(arc.quantile + (auroraNoise(u * 3 + arc.seed, arc.seed) - .5) * .22, .025, .975);
      const latitude = auroraTrack(grid, lon, hemisphere, quantile).latitude;
      // Different-length hooks, not parallel longitude rings or a polar fan.
      const folded = latitude + Math.sin(u * 8 + arc.seed) * .24 + Math.sin(u * 21 - arc.seed) * .07;
      return { lat: folded, lon: lon + Math.sin(u * 11 + arc.seed) * .35 };
    };
    // Bounded WMM samples per regional arc, interpolated between columns.
    const lattice = Array.from({ length: Math.ceil(columns / slopeStep) + 1 }, (_, i) => {
      const geo = track(Math.min(1, i * slopeStep / columns)), normal = new THREE.Vector3(...geodeticNormal(geo.lat, geo.lon));
      if (year < 2025 || year >= 2030) return new THREE.Vector3();
      const f = new THREE.Vector3(...magneticField(geo.lat, geo.lon, 120, year));
      if (f.dot(normal) < 0) f.negate();
      return f.divideScalar(Math.max(1, f.dot(normal))).sub(normal).clampLength(0, .8);
    });
    // Stable physical noise scale across forecast changes and quality levels.
    const lengthKm = arc.span * Math.PI / 180 * 6371 * .42;
    for (let col = 0; col <= columns; col++) {
      const u = col / columns, geo = track(u), k = Math.floor(col / slopeStep);
      const slope = lattice[k].clone().lerp(lattice[Math.min(k + 1, lattice.length - 1)], col / slopeStep - k);
      for (let row = 0; row <= rows; row++) {
        // More vertices in the luminous 95–230 km body, fewer in faint red tops.
        const v = row / rows, h = 95 + 355 * v * v;
        const index = arcIndex * (columns + 1) * (rows + 1) + col * (rows + 1) + row;
        const p = new THREE.Vector3(...geodeticToWorld(geo.lat, geo.lon, h * 1000)).addScaledVector(slope, h - 120);
        const inclined = worldToGeodetic(p.toArray());
        points.set(geodeticToWorld(inclined.latitude, inclined.longitude, h * 1000), index * 3);
        normals.set(geodeticNormal(geo.lat, geo.lon), index * 3);
        field.set([u * lengthKm, h, arc.seed], index * 3);
        shape.set([u, arc.weight, lengthKm, 0], index * 4);
      }
    }
  });
  return { points, normals, field, shape };
}
/** Many finite arcs, batched into eight draws. Forecasts retain stable arc IDs/buffers. */
export function buildAuroraCurtains(data: RadarAuroraData|null, material: THREE.ShaderMaterial, quality: AuroraDetail, gridOverride?:Uint8Array) {
  const group = new THREE.Group(), grid = gridOverride??auroraField(data?.samples??[]), year = decimalYear(data);
  const { columns, rows, lanes, sectors } = AURORA_DETAIL[quality];
  for (const hemisphere of [1, -1] as const) for (let batch = 0; batch < 4; batch++) {
    const arcs: Arc[] = [];
    for (let lane = 0; lane < lanes; lane++) for (let sector = batch * sectors / 4; sector < (batch + 1) * sectors / 4; sector++) arcs.push(auroraArc(lane, sector, hemisphere, lanes));
    const { points, normals, field, shape } = trackPositions(grid, hemisphere, arcs, columns, rows, year), indices: number[] = [];
    for (let arc = 0; arc < arcs.length; arc++) for (let col = 0; col < columns; col++) for (let row = 0; row < rows; row++) {
      const a = arc * (columns + 1) * (rows + 1) + col * (rows + 1) + row, b = a + rows + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(points, 3));
    geometry.setAttribute("aNextPosition", new THREE.BufferAttribute(points.slice(), 3));
    geometry.setAttribute("aNormal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("aNextNormal", new THREE.BufferAttribute(normals.slice(), 3));
    geometry.setAttribute("aField", new THREE.BufferAttribute(field, 3));
    geometry.setAttribute("aArc", new THREE.BufferAttribute(shape, 4));
    geometry.setIndex(indices); boundMorph(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { hemisphere, arcs, columns, rows }; mesh.renderOrder = 5; group.add(mesh);
  }
  return group;
}
export function updateAuroraCurtains(group: THREE.Group, data: RadarAuroraData|null, blend: number, gridOverride?:Uint8Array) {
  const grid = gridOverride??auroraField(data?.samples??[]), year = decimalYear(data);
  for (const object of group.children) {
    const mesh = object as THREE.Mesh, { hemisphere, arcs, columns, rows } = mesh.userData;
    const next = trackPositions(grid, hemisphere, arcs, columns, rows, year), geometry = mesh.geometry;
    for (const [from, to, values] of [["position", "aNextPosition", next.points], ["aNormal", "aNextNormal", next.normals]] as const) {
      const a = geometry.getAttribute(from) as THREE.BufferAttribute, b = geometry.getAttribute(to) as THREE.BufferAttribute;
      for (let i = 0; i < a.array.length; i++) a.array[i] += (b.array[i] - a.array[i]) * blend;
      (b.array as Float32Array).set(values); a.needsUpdate = b.needsUpdate = true;
    }
    boundMorph(geometry);
  }
}
