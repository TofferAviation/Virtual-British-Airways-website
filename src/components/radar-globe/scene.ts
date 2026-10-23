import * as THREE from "three";
import type {
  RadarAuroraData,
  RadarCloudData,
  VatsimStation,
} from "@/lib/radar-external";
import type { PublicRadarFlight } from "@/lib/radar-live";
import type { CloudSettings } from "@/components/BaRadarCloudLayer";
import type { AuroraSettings } from "@/components/BaRadarAuroraLayer";
import {
  WGS84_A_KM,
  WGS84_B_KM,
  geodeticToWorld,
  solarDirection,
  wrapLongitude,
  globeClipRange,
  globeZoomTarget,
  globeZoomStep,
} from "@/lib/radar-globe-geodesy";
import { GlobeSurface } from "./surface";
import { cloudNoiseTexture } from "./noise";
import { buildAuroraCurtains } from "./aurora";
import {
  surfaceVertex,
  surfaceFragment,
  volumeVertex,
  cloudFragment,
  atmosphereFragment,
  auroraVertex,
  auroraFragment,
} from "./shaders";

export type GlobeCamera = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};
export type GlobeReplay = {
  id: string;
  points: Array<{ latitude: number; longitude: number; headingDeg: number }>;
  activeIndex: number;
} | null;
export type GlobeSceneState = {
  flights: PublicRadarFlight[];
  selectedId: string;
  onSelect: (id: string) => void;
  controllers: VatsimStation[];
  onSelectController: (callsign: string) => void;
  replay: GlobeReplay;
  auroraEnabled: boolean;
  aurora: RadarAuroraData | null;
  auroraSettings: AuroraSettings;
  cloudsEnabled: boolean;
  cloudData: RadarCloudData | null;
  cloudSettings: CloudSettings;
  dayNightEnabled: boolean;
  initialCamera: GlobeCamera | null;
  onCameraChange: (camera: GlobeCamera) => void;
  /** Used exclusively by the local visual regression page. */
  testDate?: string;
  testView?: {
    latitude: number;
    longitude: number;
    distanceKm: number;
    pitch?: number;
  };
};

function clearGroup(group: THREE.Group) {
  for (const object of [...group.children]) {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
    });
    group.remove(object);
  }
}
function ellipsoidShell(heightKm: number) {
  const geometry = new THREE.SphereGeometry(WGS84_A_KM + heightKm, 192, 128);
  geometry.scale(1, (WGS84_B_KM + heightKm) / (WGS84_A_KM + heightKm), 1);
  return geometry;
}
function decodeTexture(data: RadarCloudData, encoded: string) {
  const binary = atob(encoded),
    values = new Uint8Array(binary.length);
  if (binary.length !== data.width * data.height * 4)
    throw new Error("Incomplete cloud field");
  for (let i = 0; i < binary.length; i++) values[i] = binary.charCodeAt(i);
  const texture = new THREE.DataTexture(
    values,
    data.width,
    data.height,
    THREE.RGBAFormat,
  );
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export function createGlobeScene(
  host: HTMLDivElement,
  read: () => GlobeSceneState,
) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor("#01040a");
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  if (process.env.NODE_ENV !== "production")
    renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      const message = [
        gl.getProgramInfoLog(program),
        gl.getShaderInfoLog(vertex),
        gl.getShaderInfoLog(fragment),
      ]
        .filter(Boolean)
        .join("\n");
      window.dispatchEvent(
        new CustomEvent("globe-shader-error", { detail: message }),
      );
      console.error(message);
    };
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.domElement.className = "ba-radar-globe-three-canvas";
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive WGS84 Earth globe",
  );
  renderer.domElement.tabIndex = 0;
  host.appendChild(renderer.domElement);
  const canvas = renderer.domElement,
    scene = new THREE.Scene(),
    earth = new THREE.Group();
  scene.add(earth);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.5, 120000);
  const initial = read().initialCamera,
    testView = read().testView;
  const zoomDistance = (zoom: number) =>
    WGS84_A_KM * (1 + 1.7 * Math.exp(-zoom * 0.38));
  camera.position.set(
    0,
    0,
    testView?.distanceKm ?? zoomDistance(initial?.zoom ?? 0.6),
  );
  camera.lookAt(0, 0, 0);
  let distance = camera.position.z,
    targetDistance = distance;
  let pitch = THREE.MathUtils.clamp(testView?.pitch ?? initial?.pitch ?? 0, 0, 78);
  let longitude = testView?.longitude ?? initial?.center[0] ?? -25,
    latitude = testView?.latitude ?? initial?.center[1] ?? 35;
  // For YXZ, rotations are applied X then Y. Use quaternion explicitly so the
  // chosen geographic centre is always in front of the camera, even at poles.
  const orbit = () => {
    const target = new THREE.Vector3(
      ...geodeticToWorld(latitude, longitude),
    ).normalize();
    earth.quaternion.setFromUnitVectors(target, new THREE.Vector3(0, 0, 1));
    earth.updateMatrixWorld(true);
  };
  orbit();
  const fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  fallback.needsUpdate = true;
  const base = cloudNoiseTexture(),
    detail = cloudNoiseTexture(true);
  const shared = {
    uSun: {
      value: new THREE.Vector3(
        ...solarDirection(new Date(read().testDate ?? Date.now())),
      ),
    },
    uCamera: { value: new THREE.Vector3() },
    uTime: { value: 0 },
    uDayNight: { value: 1 },
    uLowWeather: { value: fallback },
    uMiddleWeather: { value: fallback },
    uHighWeather: { value: fallback },
    uBaseNoise: { value: base },
    uDetailNoise: { value: detail },
    uLayers: { value: new THREE.Vector3(1, 1, 1) },
    uClouds: { value: 0 },
    uCloudOpacity: { value: 1 },
    uShadows: { value: 1 },
    uDebug: { value: 0 },
    uPixelAngle: { value: 0.001 },
  };
  const material = (
    vertexShader: string,
    fragmentShader: string,
    uniforms: Record<string, THREE.IUniform> = {},
  ) =>
    new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { ...shared, ...uniforms },
      vertexShader,
      fragmentShader,
    });
  const surface = new GlobeSurface(
    (texture, night) =>
      material(surfaceVertex, surfaceFragment, {
        uSurface: { value: texture },
        uNight: { value: night },
      }),
    Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  );
  earth.add(surface.group);
  const cloudMaterial = material(volumeVertex, cloudFragment, {
    uSteps: { value: 48 },
  });
  cloudMaterial.transparent = true;
  cloudMaterial.depthWrite = false;
  cloudMaterial.side = THREE.FrontSide;
  const cloudMesh = new THREE.Mesh(ellipsoidShell(18), cloudMaterial);
  cloudMesh.renderOrder = 3;
  earth.add(cloudMesh);
  const atmosphereMaterial = material(volumeVertex, atmosphereFragment);
  atmosphereMaterial.transparent = true;
  atmosphereMaterial.depthWrite = false;
  // A tilted close-up can enter the 80 km atmosphere. March the back face
  // in both cases; the analytic ground intersection clips the volume itself.
  atmosphereMaterial.side = THREE.BackSide;
  atmosphereMaterial.depthTest = false;
  const atmosphere = new THREE.Mesh(ellipsoidShell(80), atmosphereMaterial);
  atmosphere.renderOrder = 4;
  earth.add(atmosphere);
  const auroraMaterial = material(auroraVertex, auroraFragment, {
    uBrightness: { value: 1 },
    uActivity: { value: 1 },
    uSpeed: { value: 1 },
  });
  auroraMaterial.transparent = true;
  auroraMaterial.depthWrite = false;
  auroraMaterial.side = THREE.DoubleSide;
  auroraMaterial.blending = THREE.AdditiveBlending;
  let curtains = new THREE.Group();
  earth.add(curtains);
  const routes = new THREE.Group(),
    traffic = new THREE.Group();
  earth.add(routes, traffic);
  const markerMaterials = [
    new THREE.MeshBasicMaterial({ color: 0xf2c84b }),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    new THREE.MeshBasicMaterial({ color: 0x79ddff }),
  ];
  const routeMaterials = [
    new THREE.LineDashedMaterial({
      color: 0x7acaff,
      dashSize: 70,
      gapSize: 45,
    }),
    new THREE.LineBasicMaterial({ color: 0xf1c84c }),
    new THREE.LineBasicMaterial({ color: 0xed315f }),
  ];
  const pickable: THREE.Mesh[] = [];
  const addRoute = (
    points: Array<{ latitude: number; longitude: number }>,
    type: number,
  ) => {
    if (points.length < 2) return;
    const vertices: THREE.Vector3[] = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))
        continue;
      if (i > 0) {
        const prev = points[i - 1],
          from = new THREE.Vector3(
            ...geodeticToWorld(prev.latitude, prev.longitude, 3000),
          ),
          to = new THREE.Vector3(
            ...geodeticToWorld(point.latitude, point.longitude, 3000),
          );
        const steps = Math.min(30, Math.ceil(from.distanceTo(to) / 80));
        for (let step = 1; step < steps; step++) {
          const unit = from
            .clone()
            .normalize()
            .lerp(to.clone().normalize(), step / steps)
            .normalize();
          vertices.push(
            unit.multiplyScalar(
              THREE.MathUtils.lerp(from.length(), to.length(), step / steps),
            ),
          );
        }
      }
      vertices.push(
        new THREE.Vector3(
          ...geodeticToWorld(point.latitude, point.longitude, 3000),
        ),
      );
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(vertices),
      routeMaterials[type],
    );
    if (type === 0) line.computeLineDistances();
    routes.add(line);
  };
  const syncTraffic = () => {
    clearGroup(routes);
    clearGroup(traffic);
    pickable.length = 0;
    const state = read();
    const selected = state.flights.find((f) => f.id === state.selectedId);
    addRoute(selected?.plannedRoute?.points ?? [], 0);
    addRoute(
      selected?.trackSnapshots?.length
        ? selected.trackSnapshots
        : (selected?.recentSnapshots ?? []),
      1,
    );
    addRoute(state.replay?.points ?? [], 2);
    for (const flight of state.flights) {
      const p = flight.lastSnapshot;
      if (!p) continue;
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(22, 65, 3),
        markerMaterials[flight.id === state.selectedId ? 1 : 0],
      );
      marker.position.set(
        ...geodeticToWorld(
          p.latitude,
          p.longitude,
          Math.max(15000, p.altitudeFt * 0.3048),
        ),
      );
      marker.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        marker.position.clone().normalize(),
      );
      marker.userData = { kind: "flight", id: flight.id };
      traffic.add(marker);
      pickable.push(marker);
    }
    if (state.replay) {
      const p = state.replay.points[state.replay.activeIndex];
      if (p) {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(30, 12, 8),
          markerMaterials[1],
        );
        marker.position.set(...geodeticToWorld(p.latitude, p.longitude, 16000));
        traffic.add(marker);
      }
    }
    for (const controller of state.controllers) {
      if (controller.latitude == null || controller.longitude == null) continue;
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(18, 10, 6),
        markerMaterials[2],
      );
      marker.position.set(
        ...geodeticToWorld(controller.latitude, controller.longitude, 12000),
      );
      marker.userData = { kind: "controller", id: controller.callsign };
      traffic.add(marker);
      pickable.push(marker);
    }
  };
  let lastFlights: PublicRadarFlight[] | null = null,
    lastControllers: VatsimStation[] | null = null,
    lastSelection = "",
    lastReplay: GlobeReplay = null,
    lastData: RadarCloudData | null = null,
    lastAurora: RadarAuroraData | null = null,
    lastQuality = "";
  const weatherTextures: THREE.Texture[] = [];
  const sync = () => {
    const state = read();
    if (
      state.flights !== lastFlights ||
      state.controllers !== lastControllers ||
      state.selectedId !== lastSelection ||
      state.replay !== lastReplay
    ) {
      lastFlights = state.flights;
      lastControllers = state.controllers;
      lastSelection = state.selectedId;
      lastReplay = state.replay;
      syncTraffic();
    }
    if (
      state.cloudData !== lastData &&
      state.cloudData?.encoding === "rgba8-base64"
    ) {
      lastData = state.cloudData;
      weatherTextures.splice(0).forEach((texture) => texture.dispose());
      for (const layer of state.cloudData.layers) {
        const texture = decodeTexture(state.cloudData, layer.volume);
        weatherTextures.push(texture);
        const key =
          layer.id === "low"
            ? "uLowWeather"
            : layer.id === "middle"
              ? "uMiddleWeather"
              : "uHighWeather";
        shared[key].value = texture;
      }
    }
    if (
      state.aurora !== lastAurora ||
      lastQuality !== state.auroraSettings.quality
    ) {
      lastAurora = state.aurora;
      lastQuality = state.auroraSettings.quality;
      clearGroup(curtains);
      earth.remove(curtains);
      curtains = state.aurora
        ? buildAuroraCurtains(
            state.aurora,
            auroraMaterial,
            state.auroraSettings.quality === "high",
          )
        : new THREE.Group();
      earth.add(curtains);
    }
    curtains.visible = state.auroraEnabled;
    cloudMesh.visible =
      state.cloudsEnabled && state.cloudSettings.realWorld && Boolean(lastData);
    shared.uClouds.value = cloudMesh.visible ? 1 : 0;
    shared.uCloudOpacity.value = state.cloudSettings.opacity * 1.7;
    shared.uShadows.value = state.cloudSettings.selfShadows ? 1 : 0;
    shared.uLayers.value.set(
      Number(state.cloudSettings.low),
      Number(state.cloudSettings.middle),
      Number(state.cloudSettings.high),
    );
    shared.uDayNight.value = state.dayNightEnabled ? 1 : 0;
    shared.uDebug.value = {
      lit: 0,
      density: 1,
      coverage: 2,
      height: 3,
      lighting: 4,
      mesh: 0,
    }[state.cloudSettings.debugMode];
    if (process.env.NODE_ENV !== "production")
      for (const tile of surface.tiles.values())
        (tile.mesh.material as THREE.ShaderMaterial).wireframe =
          state.cloudSettings.debugMode === "mesh";
    cloudMaterial.uniforms.uSteps.value = {
      low: 20,
      medium: 32,
      high: 48,
      ultra: 64,
      auto: window.innerWidth < 850 ? 28 : 44,
    }[state.cloudSettings.quality];
    auroraMaterial.uniforms.uBrightness.value = state.auroraSettings.brightness;
    auroraMaterial.uniforms.uActivity.value = state.auroraSettings.activity;
    auroraMaterial.uniforms.uSpeed.value = state.auroraSettings.animationSpeed;
  };
  const remember = () =>
    read().onCameraChange({
      center: [longitude, latitude],
      zoom: -Math.log((targetDistance / WGS84_A_KM - 1) / 1.7) / 0.38,
      bearing: 0,
      pitch,
    });
  let down = false,
    tilting = false,
    moved = 0,
    previousX = 0,
    previousY = 0;
  const pointer = new THREE.Vector2(),
    raycaster = new THREE.Raycaster();
  const onDown = (event: PointerEvent) => {
    down = true;
    tilting = event.shiftKey;
    moved = 0;
    previousX = event.clientX;
    previousY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  };
  const onMove = (event: PointerEvent) => {
    if (!down) return;
    const dx = event.clientX - previousX,
      dy = event.clientY - previousY;
    moved += Math.abs(dx) + Math.abs(dy);
    const sensitivity =
      0.16 * Math.min(1, (distance - WGS84_A_KM) / 3500);
    if (tilting) pitch = THREE.MathUtils.clamp(pitch + dy * 0.2, 0, 78);
    else {
      longitude = wrapLongitude(longitude - dx * sensitivity);
      latitude = THREE.MathUtils.clamp(latitude + dy * sensitivity, -90, 90);
    }
    previousX = event.clientX;
    previousY = event.clientY;
    orbit();
  };
  const onUp = (event: PointerEvent) => {
    if (!down) return;
    down = false;
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    remember();
    if (moved > 5) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickable)[0];
    if (!hit) return;
    const ground = raycaster.ray
      .clone()
      .applyMatrix4(earth.matrixWorld.clone().invert())
      .intersectSphere(
        new THREE.Sphere(new THREE.Vector3(), WGS84_B_KM),
        new THREE.Vector3(),
      );
    if (
      ground &&
      camera.position.distanceTo(ground.applyMatrix4(earth.matrixWorld)) <
        hit.distance - 60
    )
      return;
    if (hit.object.userData.kind === "flight")
      read().onSelect(hit.object.userData.id);
    else read().onSelectController(hit.object.userData.id);
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    targetDistance = globeZoomTarget(
      targetDistance,
      event.deltaY,
      event.deltaMode,
      host.clientHeight,
    );
    remember();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") longitude -= 5;
    else if (event.key === "ArrowRight") longitude += 5;
    else if (event.key === "ArrowUp") latitude = Math.min(90, latitude + 5);
    else if (event.key === "ArrowDown") latitude = Math.max(-90, latitude - 5);
    else return;
    event.preventDefault();
    orbit();
    remember();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKey);
  const resize = () => {
    camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    shared.uPixelAngle.value =
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) /
      (Math.max(1, host.clientHeight) * renderer.getPixelRatio());
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();
  const started = performance.now();
  let frame = 0,
    disposed = false,
    lastSunUpdate = 0,
    lastLodUpdate = 0,
    previousFrame = started;
  const render = (now: number) => {
    if (disposed) return;
    const deltaSeconds = Math.min(0.1, Math.max(0, (now - previousFrame) / 1000));
    previousFrame = now;
    distance = globeZoomStep(distance, targetDistance, deltaSeconds);
    const height = distance - WGS84_A_KM,
      tilt = THREE.MathUtils.degToRad(pitch);
    camera.position.set(
      0,
      height * Math.sin(tilt),
      WGS84_A_KM + height * Math.cos(tilt),
    );
    camera.lookAt(0, 0, WGS84_A_KM);
    sync();
    shared.uTime.value = (now - started) / 1000;
    if (now - lastSunUpdate > 1000) {
      shared.uSun.value.set(
        ...solarDirection(new Date(read().testDate ?? Date.now())),
      );
      lastSunUpdate = now;
    }
    earth.updateMatrixWorld(true);
    // Keep the depth buffer useful at every altitude. A fixed 0.5 km near
    // plane loses tens of kilometres of depth precision from orbit.
    const clipping = globeClipRange(camera.position.length());
    camera.near = clipping.near;
    camera.far = clipping.far;
    camera.updateProjectionMatrix();
    shared.uCamera.value.copy(camera.position);
    earth.worldToLocal(shared.uCamera.value);
    if (now - lastLodUpdate > 200) {
      surface.update(shared.uCamera.value, host.clientHeight, camera.fov);
      lastLodUpdate = now;
    }
    renderer.render(scene, camera);
    if (process.env.NODE_ENV !== "production") {
      host.dataset.globeDiagnostics = JSON.stringify({
        tiles: surface.tiles.size,
        drawCalls: renderer.info.render.calls,
        textures: renderer.info.memory.textures,
        triangles: renderer.info.render.triangles,
        clouds: cloudMesh.visible,
        aurora: curtains.visible,
        sun: shared.uSun.value.toArray(),
        cameraKm: Math.round(camera.position.length()),
        pitch: Math.round(pitch),
        focus: [Math.round(longitude), Math.round(latitude)],
        clippingKm: [Math.round(camera.near), Math.round(camera.far)],
      });
    }
    frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);
  return () => {
    disposed = true;
    remember();
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("keydown", onKey);
    surface.dispose();
    clearGroup(curtains);
    clearGroup(routes);
    clearGroup(traffic);
    markerMaterials.forEach((m) => m.dispose());
    routeMaterials.forEach((m) => m.dispose());
    cloudMaterial.dispose();
    cloudMesh.geometry.dispose();
    atmosphere.geometry.dispose();
    atmosphereMaterial.dispose();
    auroraMaterial.dispose();
    base.dispose();
    detail.dispose();
    fallback.dispose();
    weatherTextures.forEach((t) => t.dispose());
    renderer.dispose();
    canvas.remove();
  };
}
