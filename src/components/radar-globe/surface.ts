import * as THREE from "three";
import {
  geographicTileBounds,
  geodeticNormal,
  geodeticToWorld,
  WGS84_A_KM,
  WGS84_B_KM,
} from "@/lib/radar-globe-geodesy";
import { GLOBE_PROFILES, refineGlobeTile, type GlobeQuality } from "@/lib/radar-globe-quality";

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
  parent: Tile | null;
  dayTexture: THREE.Texture | null;
  nightTexture: THREE.Texture | null;
  nightLoading: boolean;
  nightRetryAt: number;
  abort: AbortController | null;
};
export type SurfaceUniforms = Record<string, THREE.IUniform>;

/** CPU geometry is geodetic, including both poles; images are geographic WMS. */
export function geographicPatch(z: number, x: number, y: number) {
  const bounds = geographicTileBounds(z, x, y);
  const segments = Math.max(12, Math.min(96, Math.ceil(180 / 2 ** z)));
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
  private quality: GlobeQuality = "medium";
  private readonly placeholder = new THREE.DataTexture(new Uint8Array([7, 24, 38, 255]), 1, 1);
  private readonly black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  readonly stats = { imageryMb: 0, visible: 0, level: 0, pending: 0, budgetMb: 80 };
  constructor(
    private readonly materialFactory: (
      texture: THREE.Texture,
      night: THREE.Texture,
    ) => THREE.ShaderMaterial,
    private readonly anisotropy: number,
  ) {
    this.placeholder.needsUpdate = this.black.needsUpdate = true;
    this.roots = [this.create(0, 0, 0), this.create(0, 1, 0)];
  }
  setQuality(quality: GlobeQuality) { this.quality = quality; }
  private create(z: number, x: number, y: number, parent: Tile | null = null): Tile {
    const key = `${z}/${x}/${y}`;
    const geometry = geographicPatch(z, x, y);
    const material = this.materialFactory(this.placeholder, this.black);
    material.uniforms.uNightTransform = { value: new THREE.Vector4(1, 1, 0, 0) };
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = z === 0;
    mesh.renderOrder = z;
    // A parent is removed before its ready children are displayed. No depth
    // bias: at orbital distances polygon offsets can move terrain through
    // kilometre-high cloud layers even when both geometries are correct.
    this.group.add(mesh);
    const bounds = geographicTileBounds(z, x, y);
    const centre = new THREE.Vector3(
      ...geodeticToWorld(
        (bounds.north + bounds.south) / 2,
        (bounds.west + bounds.east) / 2,
      ),
    );
    const unit = centre.clone().normalize();
    let angularRadius = 0;
    for (const lat of [bounds.north, bounds.south]) for (const lon of [bounds.west, bounds.east]) {
      angularRadius = Math.max(angularRadius, Math.acos(THREE.MathUtils.clamp(unit.dot(new THREE.Vector3(...geodeticToWorld(lat, lon)).normalize()), -1, 1)));
    }
    const tile = {
      z,
      x,
      y,
      mesh,
      centre,
      radius: WGS84_A_KM * (angularRadius + 0.001),
      ready: false,
      loading: false,
      retryAt: 0,
      touched: 0,
      children: null,
      parent,
      dayTexture: null,
      nightTexture: null,
      nightLoading: false,
      nightRetryAt: 0,
      abort: null,
    };
    this.tiles.set(key, tile);
    this.queue.push(tile);
    if (z === 0) this.load(tile, true);
    return tile;
  }
  private async load(tile: Tile, bundled = false, night = false) {
    this.requests++;
    if (night) tile.nightLoading = true;
    else tile.loading = true;
    const controller = new AbortController();
    tile.abort = controller;
    const url = night ? `/api/radar/imagery?kind=night&z=${tile.z}&x=${tile.x}&y=${tile.y}` : bundled
      ? `/textures/earth/blue-marble-${tile.x === 0 ? "west" : "east"}.jpg`
      : `/api/radar/imagery?z=${tile.z}&x=${tile.x}&y=${tile.y}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("Imagery unavailable");
      const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: "flipY", colorSpaceConversion: "none" });
      const texture = new THREE.Texture(bitmap);
      texture.flipY = false;
      texture.needsUpdate = true;
      if (this.disposed || this.tiles.get(`${tile.z}/${tile.x}/${tile.y}`) !== tile) {
        texture.dispose();
        bitmap.close();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(this.anisotropy, GLOBE_PROFILES[this.quality].anisotropy);
      const mat = tile.mesh.material as THREE.ShaderMaterial;
      if (night) tile.nightTexture = texture;
      else {
        tile.dayTexture = texture;
        mat.uniforms.uSurface.value = texture;
        tile.ready = true;
      }
    } catch {
      if (night) tile.nightRetryAt = Date.now() + 30000;
      else {
        tile.retryAt = controller.signal.aborted ? 0 : Date.now() + 30000;
        if (!this.disposed && this.tiles.get(`${tile.z}/${tile.x}/${tile.y}`) === tile) this.queue.push(tile);
      }
    } finally {
      this.requests--;
      if (night) tile.nightLoading = false; else tile.loading = false;
      tile.abort = null;
    }
  }
  update(cameraLocal: THREE.Vector3, viewportHeight: number, fov: number, frustum: THREE.Frustum, sun: THREE.Vector3, dayNight: boolean) {
    this.frame++;
    const profile = GLOBE_PROFILES[this.quality];
    const cameraUnit = cameraLocal.clone().normalize();
    // In WGS84 a valid close camera at London/poles can be *inside* the
    // equatorial radius. A spherical A/d horizon then becomes zero and cuts
    // diagonal holes in tilted views. Scale the camera into the ellipsoid.
    const scaledDistance = Math.hypot(cameraLocal.x / WGS84_A_KM, cameraLocal.y / WGS84_B_KM, cameraLocal.z / WGS84_A_KM);
    const horizon = Math.acos(Math.min(1, 1 / scaledDistance)) + 0.004;
    const inView = (tile: Tile) => tile.z === 0 || (
      frustum.intersectsSphere(tile.mesh.geometry.boundingSphere!) &&
      Math.acos(THREE.MathUtils.clamp(tile.centre.clone().normalize().dot(cameraUnit), -1, 1)) <= horizon + tile.radius / WGS84_A_KM
    );
    // Reserve RGBA+mipmap storage before refining. This includes not-yet-
    // uploaded tiles, rather than treating JPEG download size as GPU memory.
    let reservedMb = this.reservedMb();
    const visit = (tile: Tile): boolean => {
      if (!inView(tile)) {
        tile.mesh.visible = false;
        this.hideChildren(tile);
        return false;
      }
      tile.touched = this.frame;
      const sphere = tile.mesh.geometry.boundingSphere!;
      const distance = Math.max(4, cameraLocal.distanceTo(sphere.center) - sphere.radius);
      const pixels =
        ((tile.radius / distance) * viewportHeight) /
        (2 * Math.tan((fov * Math.PI) / 360));
      const canRefine = tile.children || (this.tiles.size + 4 <= profile.maxTiles && reservedMb + 6 <= profile.cacheMb);
      if (tile.z < profile.maxLevel && refineGlobeTile(pixels, Boolean(tile.children), profile.tilePixels) && canRefine) {
        if (!tile.children) {
          tile.children = [
            this.get(tile.z + 1, tile.x * 2, tile.y * 2, tile),
            this.get(tile.z + 1, tile.x * 2 + 1, tile.y * 2, tile),
            this.get(tile.z + 1, tile.x * 2, tile.y * 2 + 1, tile),
            this.get(tile.z + 1, tile.x * 2 + 1, tile.y * 2 + 1, tile),
          ];
          reservedMb += 6;
        }
        const ready = tile.children.every((child) => child.ready || !inView(child));
        tile.mesh.visible = !ready;
        for (const child of [...tile.children].sort((a, b) => a.centre.distanceToSquared(cameraLocal) - b.centre.distanceToSquared(cameraLocal))) {
          if (ready) visit(child);
          else {
            if (inView(child)) child.touched = this.frame;
            child.mesh.visible = false;
            this.hideChildren(child);
          }
        }
      } else {
        tile.mesh.visible = tile.ready;
        this.hideChildren(tile);
      }
      return tile.ready;
    };
    for (const root of [...this.roots].sort((a, b) => a.centre.distanceToSquared(cameraLocal) - b.centre.distanceToSquared(cameraLocal))) visit(root);
    // Cancel work made irrelevant by a fast orbit, while keeping siblings
    // needed for an atomic parent/child switch marked as wanted above.
    for (const tile of this.tiles.values()) if (tile.z > 0 && tile.touched < this.frame - 2) tile.abort?.abort();
    this.queue = this.queue.filter(
      (tile) =>
        !tile.ready &&
        !tile.loading &&
        this.tiles.has(`${tile.z}/${tile.x}/${tile.y}`),
    );
    this.queue.sort(
      (a, b) =>
        Number(b.touched === this.frame) - Number(a.touched === this.frame) || a.z - b.z ||
        a.centre.distanceToSquared(cameraLocal) -
          b.centre.distanceToSquared(cameraLocal),
    );
    for (const tile of [...this.queue]) {
      if (this.requests >= profile.requests) break;
      if (tile.touched !== this.frame) continue;
      if (tile.retryAt > Date.now()) continue;
      this.queue.splice(this.queue.indexOf(tile), 1);
      this.load(tile, tile.z === 0);
    }
    // Optional city lights share the same concurrency budget. Reuse a correctly
    // cropped ancestor beyond native night detail, rather than downloading an
    // upscaled night image for every high-resolution daytime tile.
    for (const tile of this.tiles.values()) {
      if (tile.mesh.visible) this.bindNight(tile);
      if (this.requests >= profile.requests) continue;
      const nightSide = !dayNight || tile.centre.clone().normalize().dot(sun) < Math.sin(Math.min(Math.PI / 2, tile.radius / WGS84_A_KM)) + 0.15;
      if (dayNight && nightSide && tile.ready && tile.touched === this.frame && tile.z <= 6 && !tile.nightTexture && !tile.nightLoading && tile.nightRetryAt <= Date.now() && reservedMb + 1.34 < profile.cacheMb) {
        this.load(tile, false, true); reservedMb += 1.34;
      }
    }
    this.trim(profile.cacheMb, profile.maxTiles);
    const visible = [...this.tiles.values()].filter(t => t.mesh.visible);
    this.stats.imageryMb = Math.round(this.reservedMb() * 10) / 10;
    this.stats.budgetMb = profile.cacheMb;
    this.stats.visible = visible.length;
    this.stats.level = Math.max(0, ...visible.map(t => t.z));
    this.stats.pending = this.requests;
  }
  private get(z: number, x: number, y: number, parent: Tile) {
    return this.tiles.get(`${z}/${x}/${y}`) ?? this.create(z, x, y, parent);
  }
  private bindNight(tile: Tile) {
    let ancestor: Tile | null = tile;
    while (ancestor && !ancestor.nightTexture) ancestor = ancestor.parent;
    const mat = tile.mesh.material as THREE.ShaderMaterial;
    mat.uniforms.uNight.value = ancestor?.nightTexture ?? this.black;
    if (!ancestor) return;
    const factor = 2 ** (tile.z - ancestor.z), scale = 1 / factor;
    mat.uniforms.uNightTransform.value.set(scale, scale, (tile.x - ancestor.x * factor) * scale, 1 - (tile.y - ancestor.y * factor + 1) * scale);
  }
  private reservedMb() {
    let bytes = 0;
    for (const t of this.tiles.values()) {
      // Every node reserves its future day texture, plus geometry and optional night.
      const image = t.dayTexture?.image as { width?: number; height?: number } | undefined;
      if (t.z === 0 || t.ready || t.loading || t.touched === this.frame)
        bytes += (image?.width ?? (t.z === 0 ? 1024 : 512)) * (image?.height ?? (t.z === 0 ? 1024 : 512)) * 4 * 4 / 3;
      if (t.nightTexture || t.nightLoading) bytes += 512 * 512 * 4 * 4 / 3;
      const geometry = t.mesh.geometry;
      for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength;
      bytes += geometry.index?.array.byteLength ?? 0;
    }
    return bytes / 1048576;
  }
  private trim(budgetMb: number, maxTiles: number) {
    const busy = (t: Tile): boolean => t.loading || t.nightLoading || Boolean(t.children?.some(busy));
    const active = (t: Tile): boolean => t.mesh.visible || busy(t) || t.touched === this.frame || Boolean(t.children?.some(active));
    const prune = (t: Tile) => { t.children?.forEach(prune); this.release(t); this.tiles.delete(`${t.z}/${t.x}/${t.y}`); };
    for (const tile of [...this.tiles.values()].sort((a, b) => a.touched - b.touched)) {
      if (this.tiles.get(`${tile.z}/${tile.x}/${tile.y}`) !== tile) continue;
      if (!tile.children || tile.children.some(active)) continue;
      if (this.reservedMb() < budgetMb * 0.80 && this.tiles.size < maxTiles * 0.8 && this.frame - tile.touched < 30) continue;
      tile.children.forEach(prune); tile.children = null;
    }
    // A manual downgrade can start with a High/Ultra cache. Collapse complete
    // ready subtrees until the new budget fits; never leave partial tile holes.
    for (const tile of [...this.tiles.values()].sort((a, b) => b.z - a.z)) {
      if (this.reservedMb() <= budgetMb && this.tiles.size <= maxTiles) break;
      if (!tile.ready || !tile.children || tile.children.some(busy)) continue;
      const wasVisible = (t: Tile): boolean => t.mesh.visible || Boolean(t.children?.some(wasVisible));
      const showParent = tile.children.some(wasVisible);
      tile.children.forEach(prune); tile.children = null;
      tile.mesh.visible ||= showParent;
      this.bindNight(tile);
    }
  }
  private hideChildren(tile: Tile) {
    for (const child of tile.children ?? []) {
      child.mesh.visible = false;
      this.hideChildren(child);
    }
  }
  private release(tile: Tile) {
    const material = tile.mesh.material as THREE.ShaderMaterial;
    tile.abort?.abort();
    for (const texture of [tile.dayTexture, tile.nightTexture]) {
      texture?.dispose();
      (texture?.image as ImageBitmap | undefined)?.close?.();
    }
    material.dispose();
    tile.mesh.geometry.dispose();
    this.group.remove(tile.mesh);
  }
  dispose() {
    this.disposed = true;
    for (const tile of this.tiles.values()) this.release(tile);
    this.tiles.clear();
    this.placeholder.dispose(); this.black.dispose();
  }
}
