import * as THREE from "three";
import { auroraOval } from "@/lib/radar-globe-aurora";
import { geodeticNormal, geodeticToWorld } from "@/lib/radar-globe-geodesy";
import type { RadarAuroraData } from "@/lib/radar-external";

export function buildAuroraCurtains(
  data: RadarAuroraData,
  material: THREE.ShaderMaterial,
  highQuality: boolean,
) {
  const group = new THREE.Group();
  for (const hemisphere of [1, -1] as const) {
    const oval = auroraOval(data.samples, hemisphere);
    for (let sheet = 0; sheet < 2; sheet++) {
      const positions: number[] = [],
        normals: number[] = [],
        fields: number[] = [],
        indices: number[] = [];
      const columns = highQuality ? 1080 : 720,
        rows = highQuality ? 32 : 20;
      for (let col = 0; col <= columns; col++) {
        const sector = (col / columns) * 360,
          index = Math.floor(sector) % 360,
          t = sector - Math.floor(sector);
        const left = oval[index],
          right = oval[(index + 1) % 360];
        const strength = THREE.MathUtils.lerp(left.strength, right.strength, t);
        const latitude =
          THREE.MathUtils.lerp(left.latitude, right.latitude, t) +
          (sheet - 0.5) * 0.34;
        const longitude = sector;
        for (let row = 0; row <= rows; row++) {
          const h = 90000 + (row / rows) * 270000;
          // Fine, spatially coherent folds move only within the source sector.
          const phase = (sector / 360) * Math.PI * 2;
          const foldLatitude =
            latitude + Math.sin(phase * 13 + sheet * 2.2) * 0.14;
          positions.push(...geodeticToWorld(foldLatitude, longitude, h));
          normals.push(...geodeticNormal(foldLatitude, longitude));
          fields.push(phase, h / 1000, strength * (sheet === 0 ? 1 : 0.55));
        }
      }
      for (let col = 0; col < columns; col++)
        for (let row = 0; row < rows; row++) {
          const a = col * (rows + 1) + row,
            b = a + rows + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setAttribute(
        "aNormal",
        new THREE.Float32BufferAttribute(normals, 3),
      );
      geometry.setAttribute(
        "aField",
        new THREE.Float32BufferAttribute(fields, 3),
      );
      geometry.setIndex(indices);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 5;
      group.add(mesh);
    }
  }
  return group;
}
