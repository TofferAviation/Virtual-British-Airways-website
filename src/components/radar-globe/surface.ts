import * as THREE from "three";
import {
  geographicTileBounds,
  geodeticNormal,
  geodeticToWorld,
  WGS84_A_KM,
} from "@/lib/radar-globe-geodesy";

type Tile = {
  z: number;
  x: number;
  y: number;
  mesh: THREE.Mesh;
  centre: THREE.Vector3;
  radius: number;
  ready: boolean;
  loading: boolean;
  retryAt: number;
  touched: number;
  children: Tile[] | null;
};
export type SurfaceUniforms = Record<string, THREE.IUniform>;

/** CPU geometry is geodetic, including both poles; images are geographic WMS. */
export function geographicPatch(z: number, x: number, y: number) {
  const bounds = geographicTileBounds(z, x, y);
  const segments = Math.max(16, Math.ceil(180 / 2 ** z));
  const positions: number[] = [];
  const normals: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= segments; row++)
    for (let col = 0; col <= segments; col++) {
      const latitude =
        bounds.north - ((bounds.north - bounds.south) * row) / segments;
      const longitude =
        bounds.west + ((bounds.east - bounds.west) * col) / segments;
      positions.push(...geodeticToWorld(latitude, longitude));
      normals.push(...geodeticNormal(latitude, longitude));
      uv.push(col / segments, 1 - row / segments);
    }
  for (let row = 0; row < segments; row++)
    for (let col = 0; col < segments; col++) {
      const a = row * (segments + 1) + col,
        b = a + 1,
        c = a + segments + 1,
        d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export class GlobeSurface {
  readonly group = new THREE.Group();
  readonly tiles = new Map<string, Tile>();
  readonly roots: Tile[] = [];
  private requests = 0;
  private disposed = false;
  private frame = 0;
  private queue: Tile[] = [];
  constructor(
    private readonly materialFactory: (
      texture: THREE.Texture,
      night: THREE.Texture,
    ) => THREE.ShaderMaterial,
    private readonly anisotropy: number,
  ) {
    this.roots = [this.create(0, 0, 0), this.create(0, 1, 0)];
  }
  private create(z: number, x: number, y: number): Tile {
    const key = `${z}/${x}/${y}`;
    const geometry = geographicPatch(z, x, y);
    const placeholder = new THREE.DataTexture(
      new Uint8Array([7, 24, 38, 255]),
      1,
      1,
    );
    placeholder.needsUpdate = true;
    const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    black.needsUpdate = true;
    const material = this.materialFactory(placeholder, black);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = z === 0;
    mesh.renderOrder = z;
    // Polygon offset places children over their parents during handoff without
    // inventing terrain elevation or creating geographic gaps.
    material.polygonOffset = true;
    material.polygonOffsetFactor = -z;
    material.polygonOffsetUnits = -z;
    this.group.add(mesh);
    const bounds = geographicTileBounds(z, x, y);
    const centre = new THREE.Vector3(
      ...geodeticToWorld(
        (bounds.north + bounds.south) / 2,
        (bounds.west + bounds.east) / 2,
      ),
    );
    const tile = {
      z,
      x,
      y,
      mesh,
      centre,
      radius: WGS84_A_KM * Math.min(Math.PI, ((180 / 2 ** z) * Math.PI) / 180),
      ready: false,
      loading: false,
      retryAt: 0,
      touched: 0,
      children: null,
    };
    this.tiles.set(key, tile);
    this.queue.push(tile);
    if (z === 0) this.load(tile, true);
    return tile;
  }
  private load(tile: Tile, bundled = false) {
    this.requests++;
    tile.loading = true;
    const loader = new THREE.TextureLoader();
    const url = bundled
      ? `/textures/earth/blue-marble-${tile.x === 0 ? "west" : "east"}.jpg`
      : `/api/radar/imagery?z=${tile.z}&x=${tile.x}&y=${tile.y}`;
    loader.load(
      url,
      (texture) => {
        this.requests--;
        tile.loading = false;
        if (
          this.disposed ||
          this.tiles.get(`${tile.z}/${tile.x}/${tile.y}`) !== tile
        ) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.anisotropy;
        const mat = tile.mesh.material as THREE.ShaderMaterial;
        mat.uniforms.uSurface.value.dispose();
        mat.uniforms.uSurface.value = texture;
        tile.ready = true;
        // Night image is optional; failed night tiles never block daylight.
        loader.load(
          `/api/radar/imagery?kind=night&z=${tile.z}&x=${tile.x}&y=${tile.y}`,
          (night) => {
            if (
              this.disposed ||
              this.tiles.get(`${tile.z}/${tile.x}/${tile.y}`) !== tile
            ) {
              night.dispose();
              return;
            }
            night.colorSpace = THREE.SRGBColorSpace;
            night.anisotropy = this.anisotropy;
            mat.uniforms.uNight.value.dispose();
            mat.uniforms.uNight.value = night;
          },
          undefined,
          () => {},
        );
      },
      undefined,
      () => {
        this.requests--;
        tile.loading = false;
        tile.retryAt = Date.now() + 30000;
        if (!this.disposed) this.queue.push(tile);
      },
    );
  }
  update(cameraLocal: THREE.Vector3, viewportHeight: number, fov: number) {
    this.frame++;
    const frustumDistance = cameraLocal.length();
    const visit = (tile: Tile): boolean => {
      const angle = Math.acos(
        THREE.MathUtils.clamp(
          tile.centre.clone().normalize().dot(cameraLocal.clone().normalize()),
          -1,
          1,
        ),
      );
      const horizon = Math.acos(Math.min(1, WGS84_A_KM / frustumDistance));
      if (tile.z > 0 && angle > horizon + tile.radius / WGS84_A_KM) {
        tile.mesh.visible = false;
        this.hideChildren(tile);
        return false;
      }
      tile.touched = this.frame;
      const distance = Math.max(
        40,
        cameraLocal.distanceTo(tile.centre) - tile.radius * 0.3,
      );
      const pixels =
        ((tile.radius / distance) * viewportHeight) /
        (2 * Math.tan((fov * Math.PI) / 360));
      if (tile.z < 6 && pixels > 420) {
        tile.children ??= [
          this.get(tile.z + 1, tile.x * 2, tile.y * 2),
          this.get(tile.z + 1, tile.x * 2 + 1, tile.y * 2),
          this.get(tile.z + 1, tile.x * 2, tile.y * 2 + 1),
          this.get(tile.z + 1, tile.x * 2 + 1, tile.y * 2 + 1),
        ];
        const ready = tile.children.every((child) => child.ready);
        tile.mesh.visible = !ready;
        for (const child of tile.children) {
          if (ready) visit(child);
          else child.mesh.visible = false;
        }
      } else {
        tile.mesh.visible = tile.ready;
        this.hideChildren(tile);
      }
      return tile.ready;
    };
    for (const root of this.roots) visit(root);
    this.queue = this.queue.filter(
      (tile) =>
        !tile.ready &&
        !tile.loading &&
        this.tiles.has(`${tile.z}/${tile.x}/${tile.y}`),
    );
    this.queue.sort(
      (a, b) =>
        a.z - b.z ||
        a.centre.distanceToSquared(cameraLocal) -
          b.centre.distanceToSquared(cameraLocal),
    );
    for (const tile of [...this.queue]) {
      if (this.requests >= 6) break;
      if (tile.retryAt > Date.now()) continue;
      this.queue.splice(this.queue.indexOf(tile), 1);
      this.load(tile, tile.z === 0);
    }
    // Bound retained GPU imagery. Dormant descendants can be re-requested.
    if (this.tiles.size > 180)
      for (const tile of this.tiles.values()) {
        if (
          !tile.children ||
          tile.children.some(
            (child) =>
              child.mesh.visible ||
              child.loading ||
              this.frame - child.touched < 90,
          )
        )
          continue;
        const prune = (child: Tile) => {
          for (const descendant of child.children ?? []) prune(descendant);
          this.release(child);
          this.tiles.delete(`${child.z}/${child.x}/${child.y}`);
        };
        tile.children.forEach(prune);
        tile.children = null;
        if (this.tiles.size <= 150) break;
      }
  }
  private get(z: number, x: number, y: number) {
    return this.tiles.get(`${z}/${x}/${y}`) ?? this.create(z, x, y);
  }
  private hideChildren(tile: Tile) {
    for (const child of tile.children ?? []) {
      child.mesh.visible = false;
      this.hideChildren(child);
    }
  }
  private release(tile: Tile) {
    const material = tile.mesh.material as THREE.ShaderMaterial;
    material.uniforms.uSurface.value.dispose();
    material.uniforms.uNight.value.dispose();
    material.dispose();
    tile.mesh.geometry.dispose();
    this.group.remove(tile.mesh);
  }
  dispose() {
    this.disposed = true;
    for (const tile of this.tiles.values()) this.release(tile);
    this.tiles.clear();
  }
}
