"use client";

import { useEffect, useRef } from "react";
import type { RadarAuroraData, RadarCloudData, VatsimStation } from "@/lib/radar-external";
import type { PublicRadarFlight } from "@/lib/radar-live";
import type { AuroraSettings } from "@/components/BaRadarAuroraLayer";
import type { CloudSettings } from "@/components/BaRadarCloudLayer";

type GlobeReplay = { id: string; points: Array<{ latitude: number; longitude: number; headingDeg: number }>; activeIndex: number } | null;
export type GlobeCamera = { center: [number, number]; zoom: number; bearing: number; pitch: number };

const TAU = Math.PI * 2;
const EARTH_RADIUS_METRES = 6_371_000;
const CLOUD_INNER_RADIUS = 1.00025;
const CLOUD_OUTER_RADIUS = 1.0045;
// Keep the surface clear. A baked cloud photograph on the diffuse Earth map
// makes it impossible to tell the live atmospheric volume from the ground.
const EARTH_TEXTURE = "https://svs.gsfc.nasa.gov/vis/a000000/a003600/a003615/earth_noClouds.0330.jpg";

function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)); }
function validPoint(latitude: number, longitude: number) { return Number.isFinite(latitude) && Number.isFinite(longitude); }
function normalLongitude(longitude: number) { return ((longitude + 540) % 360) - 180; }
function bytesFromBase64(value: string) {
  const binary = window.atob(value);
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) result[index] = binary.charCodeAt(index);
  return result;
}

function smoothValueNoise(x: number, y: number, z: number, size: number) {
  const hash = (a: number, b: number, c: number) => {
    const n = Math.sin((a * 157.13 + b * 113.71 + c * 271.91) * 0.071) * 43758.5453;
    return n - Math.floor(n);
  };
  const ix = Math.floor(x); const iy = Math.floor(y); const iz = Math.floor(z);
  const fx = x - ix; const fy = y - iy; const fz = z - iz;
  const fade = (v: number) => v * v * (3 - 2 * v);
  const tx = fade(fx); const ty = fade(fy); const tz = fade(fz);
  const at = (dx: number, dy: number, dz: number) => hash((ix + dx + size) % size, (iy + dy + size) % size, (iz + dz + size) % size);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  return mix(mix(mix(at(0, 0, 0), at(1, 0, 0), tx), mix(at(0, 1, 0), at(1, 1, 0), tx), ty), mix(mix(at(0, 0, 1), at(1, 0, 1), tx), mix(at(0, 1, 1), at(1, 1, 1), tx), ty), tz);
}

function makeNoiseVolume(size: number, detail: boolean) {
  const values = new Uint8Array(size * size * size);
  let offset = 0;
  for (let z = 0; z < size; z += 1) for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const scale = detail ? 4.8 : 1.25;
    const a = smoothValueNoise(x * scale / size * 8, y * scale / size * 8, z * scale / size * 8, size);
    const b = smoothValueNoise(x * scale / size * 17 + 13, y * scale / size * 17 + 7, z * scale / size * 17 + 19, size);
    values[offset++] = Math.round(clamp(a * 0.68 + b * 0.32, 0, 1) * 255);
  }
  return values;
}

function makeAuroraTexture(three: typeof import("three"), samples: RadarAuroraData["samples"]) {
  const width = 720; const height = 360; const values = new Uint8Array(width * height);
  for (const sample of samples) {
    if (sample.probability < 8) continue;
    const x = Math.round((normalLongitude(sample.longitude) + 180) / 360 * (width - 1));
    const y = Math.round((90 - sample.latitude) / 180 * (height - 1));
    const intensity = clamp(sample.probability / 100, 0, 1);
    // OVATION cells are intentionally softened into one continuous oval.
    // This keeps source probability but removes the sampled-grid artefact.
    for (let dy = -3; dy <= 3; dy += 1) for (let dx = -5; dx <= 5; dx += 1) {
      const px = (x + dx + width) % width; const py = y + dy;
      if (py < 0 || py >= height) continue;
      const falloff = Math.max(0, 1 - Math.hypot(dx / 5, dy / 3));
      const index = py * width + px;
      values[index] = Math.max(values[index], Math.round(intensity * falloff * 255));
    }
  }
  const texture = new three.DataTexture(values, width, height, three.RedFormat, three.UnsignedByteType);
  texture.minFilter = three.LinearFilter; texture.magFilter = three.LinearFilter;
  texture.wrapS = three.RepeatWrapping; texture.wrapT = three.ClampToEdgeWrapping;
  texture.colorSpace = three.NoColorSpace; texture.needsUpdate = true;
  return texture;
}

const cloudVertexShader = `
  out vec3 vLocalPosition;
  void main() {
    vLocalPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// The planet is a cloud shell, not a collection of geographic planes. Every
// pixel intersects the shell and integrates procedural density through it.
const cloudFragmentShader = `
  precision highp float;
  precision highp sampler3D;
  in vec3 vLocalPosition;
  out vec4 fragColor;
  uniform vec3 uCameraLocal;
  uniform sampler2D uLowWeather;
  uniform sampler2D uMiddleWeather;
  uniform sampler2D uHighWeather;
  uniform sampler3D uBaseNoise;
  uniform sampler3D uDetailNoise;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uUseLow;
  uniform float uUseMiddle;
  uniform float uUseHigh;
  uniform float uSelfShadow;
  uniform float uRelief;
  uniform float uSteps;
  const float PI = 3.14159265359;
  const float INNER_RADIUS = ${CLOUD_INNER_RADIUS.toFixed(6)};
  const float OUTER_RADIUS = ${CLOUD_OUTER_RADIUS.toFixed(6)};
  const float EARTH_METRES = ${EARTH_RADIUS_METRES.toFixed(1)};

  bool sphereHit(vec3 ro, vec3 rd, float radius, out float nearT, out float farT) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - radius * radius;
    float h = b * b - c;
    if (h < 0.0) return false;
    h = sqrt(h);
    nearT = -b - h; farT = -b + h;
    return farT > 0.0;
  }
  vec2 weatherUv(vec3 position) {
    vec3 direction = normalize(position);
    return vec2(atan(direction.x, direction.z) / (2.0 * PI) + 0.5, 0.5 - asin(direction.y) / PI);
  }
  float layerDensity(vec4 weather, float altitude, float enabled, vec2 uv, float seed) {
    float coverage = weather.r * enabled;
    float base = weather.g * 255.0 * 100.0;
    float top = weather.b * 255.0 * 100.0;
    if (weather.a < 0.5 || coverage < 0.025 || top <= base + 150.0) return 0.0;
    float centre = base + (top - base) * 0.5;
    float spread = max(220.0, (top - base) * 0.5 * uRelief);
    float heightMask = 1.0 - smoothstep(spread * 0.72, spread, abs(altitude - centre));
    // Forecast cells decide where clouds may occur. The procedural field
    // creates formations inside that weather footprint at cloud, not
    // continent, scale: banks, broken stratocumulus and denser cores.
    vec3 drift = vec3(uv.x * 17.0 + uTime * 0.004 + seed, uv.y * 10.0 - uTime * 0.0021, altitude / 7800.0);
    float shape = texture(uBaseNoise, fract(drift)).r;
    float erosion = texture(uDetailNoise, fract(drift * 2.7 + vec3(0.13, 0.71, 0.31))).r;
    float threshold = mix(0.70, 0.24, coverage);
    float body = smoothstep(threshold - 0.16, threshold + 0.14, shape - erosion * 0.18);
    // Preserve overcast fields as continuous textured decks while allowing
    // lower forecast cover to resolve into individual cloud formations.
    body = mix(body, max(body, coverage * 0.72), smoothstep(0.70, 1.0, coverage));
    return body * heightMask * smoothstep(0.015, 0.20, coverage);
  }
  void main() {
    vec3 rayOrigin = uCameraLocal;
    vec3 rayDirection = normalize(vLocalPosition - rayOrigin);
    float shellNear; float shellFar;
    if (!sphereHit(rayOrigin, rayDirection, OUTER_RADIUS, shellNear, shellFar)) discard;
    float innerNear; float innerFar;
    bool innerHit = sphereHit(rayOrigin, rayDirection, INNER_RADIUS, innerNear, innerFar);
    float start = max(shellNear, 0.0);
    float finish = shellFar;
    if (innerHit && innerNear > start) finish = innerNear;
    if (finish <= start) discard;
    float steps = max(8.0, uSteps);
    float delta = (finish - start) / steps;
    float transmittance = 1.0;
    vec3 scattered = vec3(0.0);
    for (int index = 0; index < 48; index++) {
      if (float(index) >= steps) break;
      vec3 position = rayOrigin + rayDirection * (start + (float(index) + 0.5) * delta);
      float altitude = max(0.0, (length(position) - 1.0) * EARTH_METRES);
      vec2 uv = weatherUv(position);
      float density = max(layerDensity(texture(uLowWeather, uv), altitude, uUseLow, uv, 0.10), max(layerDensity(texture(uMiddleWeather, uv), altitude, uUseMiddle, uv, 0.44), layerDensity(texture(uHighWeather, uv), altitude, uUseHigh, uv, 0.77)));
      if (density < 0.003) continue;
      float phase = 0.55 + 0.45 * max(0.0, dot(normalize(position), normalize(vec3(-0.55, 0.62, 0.44))));
      float shade = mix(1.0, 0.52 + 0.48 * exp(-density * 4.0), uSelfShadow);
      float opticalDepth = density * delta * 1120.0 * uOpacity;
      float alpha = 1.0 - exp(-opticalDepth);
      vec3 cloudColour = mix(vec3(0.29, 0.33, 0.39), vec3(0.93, 0.96, 1.0), phase) * shade;
      scattered += transmittance * cloudColour * alpha;
      transmittance *= 1.0 - alpha;
      if (transmittance < 0.025) break;
    }
    float alpha = 1.0 - transmittance;
    if (alpha < 0.008) discard;
    fragColor = vec4(scattered / max(alpha, 0.001), alpha);
  }
`;

const groundShadowVertexShader = `
  out vec3 vWorldNormal;
  out vec2 vUv;
  void main() { vUv = uv; vWorldNormal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const groundShadowFragmentShader = `
  precision highp float;
  in vec3 vWorldNormal;
  in vec2 vUv;
  out vec4 fragColor;
  uniform sampler2D uLowWeather;
  uniform sampler2D uMiddleWeather;
  uniform sampler2D uHighWeather;
  uniform float uTime;
  uniform float uEnabled;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 cell = floor(p); vec2 local = fract(p);
    local = local * local * (3.0 - 2.0 * local);
    return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x), mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x), local.y);
  }
  void main() {
    float coverage = max(texture(uLowWeather, vUv).r, max(texture(uMiddleWeather, vUv).r, texture(uHighWeather, vUv).r));
    float detail = noise(vUv * vec2(36.0, 22.0) + uTime * 0.003) * 0.68 + noise(vUv * vec2(83.0, 47.0) - uTime * 0.006) * 0.32;
    float sunward = max(0.0, dot(normalize(vWorldNormal), normalize(vec3(-0.55, 0.62, 0.44))));
    float alpha = smoothstep(0.18, 0.72, coverage) * smoothstep(0.20, 0.72, detail) * sunward * 0.30 * uEnabled;
    fragColor = vec4(vec3(0.025, 0.06, 0.09), alpha);
  }
`;

const auroraVertexShader = `
  precision highp float;
  uniform sampler2D uAuroraMap;
  uniform float uTime;
  uniform float uActivity;
  uniform float uEnhanced;
  out float vStrength;
  out float vCurtain;
  void main() {
    float strength = texture(uAuroraMap, uv).r;
    float folds = 0.56 + 0.44 * sin(uv.x * 188.0 + sin(uv.x * 29.0) * 3.0 + uTime * 0.8);
    float height = strength * (0.018 + 0.074 * uEnhanced) * uActivity * (0.72 + folds * 0.42);
    vStrength = strength;
    vCurtain = folds;
    vec3 displaced = position + normal * height;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const auroraFragmentShader = `
  precision highp float;
  in float vStrength;
  in float vCurtain;
  out vec4 fragColor;
  uniform float uBrightness;
  void main() {
    float ribbon = smoothstep(0.20, 0.72, vCurtain);
    float alpha = vStrength * ribbon * 0.72 * uBrightness;
    if (alpha < 0.012) discard;
    vec3 colour = mix(vec3(0.03, 0.44, 0.28), vec3(0.36, 1.0, 0.92), clamp(vCurtain, 0.0, 1.0));
    fragColor = vec4(colour, alpha);
  }
`;

function latLonVector(three: typeof import("three"), latitude: number, longitude: number, radius: number) {
  const lat = latitude * Math.PI / 180;
  const lon = longitude * Math.PI / 180;
  return new three.Vector3(Math.cos(lat) * Math.sin(lon) * radius, Math.sin(lat) * radius, Math.cos(lat) * Math.cos(lon) * radius);
}

function qualitySteps(settings: CloudSettings) {
  if (settings.quality === "ultra") return 42;
  if (settings.quality === "high") return 32;
  if (settings.quality === "medium") return 24;
  if (settings.quality === "low") return 14;
  return Math.min(36, window.innerWidth < 850 ? 20 : 30);
}

export function BaRadarThreeGlobe(props: {
  flights: PublicRadarFlight[]; selectedId: string; onSelect: (id: string) => void;
  controllers: VatsimStation[]; onSelectController: (callsign: string) => void; replay: GlobeReplay;
  auroraEnabled: boolean; aurora: RadarAuroraData | null; auroraSettings: AuroraSettings;
  cloudsEnabled: boolean; cloudData: RadarCloudData | null; cloudSettings: CloudSettings;
  dayNightEnabled: boolean; initialCamera: GlobeCamera | null; onCameraChange: (camera: GlobeCamera) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    let disposed = false;
    let renderer: import("three").WebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let animationId = 0;
    let cleanupPointer = () => {};
    const start = async () => {
      const host = container.current;
      if (!host) return;
      const three = await import("three");
      if (disposed || !container.current) return;
      const scene = new three.Scene();
      const camera = new three.PerspectiveCamera(31, 1, 0.02, 100);
      const initial = propsRef.current.initialCamera;
      const globe = new three.Group();
      globe.rotation.x = clamp((initial?.center[1] ?? 45) * Math.PI / 180, -1.25, 1.25);
      globe.rotation.y = -((initial?.center[0] ?? -15) * Math.PI / 180);
      scene.add(globe);
      const distanceFromZoom = (zoom: number) => clamp(3.2 - zoom * 0.34, 1.38, 5.2);
      camera.position.set(0, 0, distanceFromZoom(initial?.zoom ?? 1.2));
      camera.lookAt(0, 0, 0);
      renderer = new three.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor("#020913", 1);
      renderer.outputColorSpace = three.SRGBColorSpace;
      renderer.domElement.className = "ba-radar-globe-three-canvas";
      renderer.domElement.setAttribute("aria-label", "BA-Radar interactive 3D globe");
      host.replaceChildren(renderer.domElement);

      const ambient = new three.HemisphereLight(0x8bc7ee, 0x06111e, 1.35);
      scene.add(ambient);
      const sun = new three.DirectionalLight(0xfff1d5, 2.5);
      sun.position.set(-4, 3, 4);
      scene.add(sun);
      const earthMaterial = new three.MeshPhongMaterial({ color: 0x688174, shininess: 4, specular: 0x122a36 });
      const earth = new three.Mesh(new three.SphereGeometry(1, 144, 96), earthMaterial);
      globe.add(earth);
      new three.TextureLoader().load(EARTH_TEXTURE, (texture) => {
        texture.colorSpace = three.SRGBColorSpace;
        texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1;
        earthMaterial.map = texture;
        earthMaterial.color.setHex(0xffffff);
        earthMaterial.needsUpdate = true;
      });
      const atmosphere = new three.Mesh(new three.SphereGeometry(1.026, 96, 64), new three.ShaderMaterial({
        transparent: true, side: three.BackSide, depthWrite: false, blending: three.AdditiveBlending,
        uniforms: { uCamera: { value: camera.position.clone() } },
        vertexShader: "varying vec3 vNormalWorld; void main(){ vNormalWorld=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
        fragmentShader: "uniform vec3 uCamera; varying vec3 vNormalWorld; void main(){ float rim=pow(1.0-abs(vNormalWorld.z),3.0); gl_FragColor=vec4(0.12,0.48,0.82,rim*.32); }",
      }));
      globe.add(atmosphere);

      const noiseTexture = (size: number, detail: boolean) => {
        const texture = new three.Data3DTexture(makeNoiseVolume(size, detail), size, size, size);
        texture.format = three.RedFormat; texture.type = three.UnsignedByteType;
        texture.minFilter = three.LinearFilter; texture.magFilter = three.LinearFilter;
        texture.wrapS = texture.wrapT = texture.wrapR = three.RepeatWrapping;
        texture.unpackAlignment = 1; texture.needsUpdate = true;
        return texture;
      };
      const fallbackWeather = new three.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, three.RGBAFormat);
      fallbackWeather.needsUpdate = true;
      const baseNoise = noiseTexture(40, false);
      const detailNoise = noiseTexture(28, true);
      const cloudMaterial = new three.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: true, glslVersion: three.GLSL3,
        uniforms: {
          uCameraLocal: { value: new three.Vector3() }, uLowWeather: { value: fallbackWeather }, uMiddleWeather: { value: fallbackWeather }, uHighWeather: { value: fallbackWeather },
          uBaseNoise: { value: baseNoise }, uDetailNoise: { value: detailNoise },
          uOpacity: { value: 0.55 }, uTime: { value: 0 }, uUseLow: { value: 1 }, uUseMiddle: { value: 1 }, uUseHigh: { value: 1 }, uSelfShadow: { value: 1 }, uRelief: { value: 1 }, uSteps: { value: 30 },
        }, vertexShader: cloudVertexShader, fragmentShader: cloudFragmentShader,
      });
      const clouds = new three.Mesh(new three.SphereGeometry(CLOUD_OUTER_RADIUS, 176, 112), cloudMaterial);
      clouds.renderOrder = 2;
      globe.add(clouds);

      // A low-opacity surface pass makes the cloud deck cast a readable
      // shadow on the land/ocean texture. The volume remains the source of
      // visible cloud form; this pass only supplies its ground response.
      const shadowMaterial = new three.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: true, glslVersion: three.GLSL3,
        uniforms: { uLowWeather: { value: fallbackWeather }, uMiddleWeather: { value: fallbackWeather }, uHighWeather: { value: fallbackWeather }, uTime: { value: 0 }, uEnabled: { value: 1 } },
        vertexShader: groundShadowVertexShader, fragmentShader: groundShadowFragmentShader,
      });
      const cloudShadows = new three.Mesh(new three.SphereGeometry(1.001, 176, 112), shadowMaterial);
      cloudShadows.renderOrder = 1;
      globe.add(cloudShadows);

      const emptyAurora = new three.DataTexture(new Uint8Array([0]), 1, 1, three.RedFormat, three.UnsignedByteType);
      emptyAurora.needsUpdate = true;
      const auroraMaterial = new three.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: true, side: three.DoubleSide, blending: three.AdditiveBlending, glslVersion: three.GLSL3,
        uniforms: { uAuroraMap: { value: emptyAurora }, uTime: { value: 0 }, uActivity: { value: 1 }, uEnhanced: { value: 1 }, uBrightness: { value: 1 } },
        vertexShader: auroraVertexShader, fragmentShader: auroraFragmentShader,
      });
      const auroraShell = new three.Mesh(new three.SphereGeometry(1.014, 240, 144), auroraMaterial);
      auroraShell.renderOrder = 3; auroraShell.visible = false;
      globe.add(auroraShell);

      const routes = new three.Group(); const traffic = new three.Group();
      globe.add(routes, traffic);
      const pointHits: Array<{ object: import("three").Object3D; kind: "flight" | "controller"; id: string }> = [];
      const disposeGroup = (group: import("three").Group) => {
        while (group.children.length) {
          const child = group.children.pop() as import("three").Object3D & { geometry?: import("three").BufferGeometry; material?: import("three").Material | import("three").Material[] };
          child.geometry?.dispose();
          if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose()); else child.material?.dispose();
        }
      };
      const weatherTextures = new Map<string, import("three").DataTexture>();
      let auroraTexture: import("three").DataTexture = emptyAurora;
      const syncWeather = () => {
        const current = propsRef.current;
        clouds.visible = Boolean(current.cloudsEnabled && current.cloudData && current.cloudSettings.realWorld);
        cloudShadows.visible = clouds.visible;
        cloudMaterial.uniforms.uOpacity.value = current.cloudSettings.opacity;
        cloudMaterial.uniforms.uUseLow.value = current.cloudSettings.low ? 1 : 0;
        cloudMaterial.uniforms.uUseMiddle.value = current.cloudSettings.middle ? 1 : 0;
        cloudMaterial.uniforms.uUseHigh.value = current.cloudSettings.high ? 1 : 0;
        cloudMaterial.uniforms.uSelfShadow.value = current.cloudSettings.selfShadows ? 1 : 0;
        cloudMaterial.uniforms.uRelief.value = current.cloudSettings.enhancedPresentation ? 1.38 : 1;
        cloudMaterial.uniforms.uSteps.value = qualitySteps(current.cloudSettings);
        const data = current.cloudData;
        if (!data || data.encoding !== "rgba8-base64") return;
        for (const layer of data.layers) {
          const old = weatherTextures.get(layer.id);
          const bytes = bytesFromBase64(layer.volume);
          if (bytes.length !== data.width * data.height * 4) continue;
          const texture = new three.DataTexture(bytes, data.width, data.height, three.RGBAFormat, three.UnsignedByteType);
          texture.minFilter = three.LinearFilter; texture.magFilter = three.LinearFilter;
          texture.wrapS = three.RepeatWrapping; texture.wrapT = three.ClampToEdgeWrapping;
          texture.colorSpace = three.NoColorSpace; texture.needsUpdate = true;
          weatherTextures.set(layer.id, texture); old?.dispose();
        }
        cloudMaterial.uniforms.uLowWeather.value = weatherTextures.get("low") ?? fallbackWeather;
        cloudMaterial.uniforms.uMiddleWeather.value = weatherTextures.get("middle") ?? fallbackWeather;
        cloudMaterial.uniforms.uHighWeather.value = weatherTextures.get("high") ?? fallbackWeather;
        shadowMaterial.uniforms.uLowWeather.value = weatherTextures.get("low") ?? fallbackWeather;
        shadowMaterial.uniforms.uMiddleWeather.value = weatherTextures.get("middle") ?? fallbackWeather;
        shadowMaterial.uniforms.uHighWeather.value = weatherTextures.get("high") ?? fallbackWeather;
        shadowMaterial.uniforms.uEnabled.value = current.cloudSettings.selfShadows ? 1 : 0;
      };
      const addRoute = (points: Array<{ latitude: number; longitude: number }>, colour: number, dashed: boolean) => {
        if (points.length < 2) return;
        const vectors = points.filter((point) => validPoint(point.latitude, point.longitude)).map((point) => latLonVector(three, point.latitude, point.longitude, 1.009));
        if (vectors.length < 2) return;
        const geometry = new three.BufferGeometry().setFromPoints(vectors);
        const material = dashed ? new three.LineDashedMaterial({ color: colour, dashSize: 0.022, gapSize: 0.017, transparent: true, opacity: 0.88 }) : new three.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.96 });
        const line = new three.Line(geometry, material); if (dashed) line.computeLineDistances(); routes.add(line);
      };
      const syncObjects = () => {
        disposeGroup(routes); disposeGroup(traffic); pointHits.length = 0;
        const current = propsRef.current;
        const selected = current.flights.find((flight) => flight.id === current.selectedId);
        addRoute(selected?.plannedRoute?.points ?? [], 0x72c7ff, true);
        addRoute(selected?.trackSnapshots?.length ? selected.trackSnapshots : selected?.recentSnapshots ?? [], 0xf4c430, false);
        addRoute(current.replay?.points ?? [], 0xd91e45, false);
        for (const flight of current.flights) {
          const point = flight.lastSnapshot;
          if (!point || !validPoint(point.latitude, point.longitude)) continue;
          const selectedFlight = flight.id === current.selectedId;
          const marker = new three.Mesh(new three.SphereGeometry(selectedFlight ? 0.017 : 0.011, 12, 8), new three.MeshBasicMaterial({ color: selectedFlight ? 0xffffff : 0xf4c430 }));
          marker.position.copy(latLonVector(three, point.latitude, point.longitude, 1.018)); traffic.add(marker); pointHits.push({ object: marker, kind: "flight", id: flight.id });
        }
        for (const controller of current.controllers) {
          if (controller.latitude == null || controller.longitude == null || !validPoint(controller.latitude, controller.longitude)) continue;
          const marker = new three.Mesh(new three.SphereGeometry(0.008, 10, 8), new three.MeshBasicMaterial({ color: 0x7de3ff }));
          marker.position.copy(latLonVector(three, controller.latitude, controller.longitude, 1.016)); traffic.add(marker); pointHits.push({ object: marker, kind: "controller", id: controller.callsign });
        }
        const shouldShowAurora = Boolean(current.auroraEnabled && current.aurora?.samples.length);
        auroraShell.visible = shouldShowAurora;
        if (shouldShowAurora && current.aurora) {
          const nextTexture = makeAuroraTexture(three, current.aurora.samples);
          auroraMaterial.uniforms.uAuroraMap.value = nextTexture;
          if (auroraTexture !== emptyAurora) auroraTexture.dispose();
          auroraTexture = nextTexture;
        }
      };
      syncWeather(); syncObjects();
      let previousData = propsRef.current.cloudData; let previousSignature = "";
      const syncIfNeeded = () => {
        const current = propsRef.current;
        const signature = `${current.selectedId}|${current.flights.length}|${current.controllers.length}|${current.replay?.id ?? ""}|${current.auroraEnabled}|${current.aurora?.forecastAt ?? ""}`;
        if (signature !== previousSignature) { previousSignature = signature; syncObjects(); }
        if (current.cloudData !== previousData) { previousData = current.cloudData; syncWeather(); }
      };
      const rememberCamera = () => {
        const longitude = normalLongitude(-globe.rotation.y * 180 / Math.PI);
        const latitude = clamp(globe.rotation.x * 180 / Math.PI, -85, 85);
        propsRef.current.onCameraChange({ center: [longitude, latitude], zoom: (3.2 - camera.position.z) / 0.34, bearing: 0, pitch: 0 });
      };
      let dragging = false; let moved = false; let lastX = 0; let lastY = 0;
      const canvas = renderer.domElement;
      const raycaster = new three.Raycaster(); const pointer = new three.Vector2();
      const onDown = (event: PointerEvent) => { dragging = true; moved = false; lastX = event.clientX; lastY = event.clientY; canvas.setPointerCapture(event.pointerId); };
      const onMove = (event: PointerEvent) => { if (!dragging) return; const dx = event.clientX - lastX; const dy = event.clientY - lastY; if (Math.abs(dx) + Math.abs(dy) > 2) moved = true; globe.rotation.y += dx * 0.005; globe.rotation.x = clamp(globe.rotation.x + dy * 0.004, -1.25, 1.25); lastX = event.clientX; lastY = event.clientY; };
      const onUp = (event: PointerEvent) => {
        if (!dragging) return; dragging = false; canvas.releasePointerCapture(event.pointerId); rememberCamera();
        if (!moved) { const rect = canvas.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(pointHits.map((entry) => entry.object), false)[0]; const selectedHit = pointHits.find((entry) => entry.object === hit?.object); if (selectedHit?.kind === "flight") propsRef.current.onSelect(selectedHit.id); if (selectedHit?.kind === "controller") propsRef.current.onSelectController(selectedHit.id); }
      };
      const onWheel = (event: WheelEvent) => { event.preventDefault(); camera.position.z = clamp(camera.position.z + event.deltaY * 0.002, 1.32, 5.2); rememberCamera(); };
      canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerup", onUp); canvas.addEventListener("wheel", onWheel, { passive: false });
      cleanupPointer = () => { canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("wheel", onWheel); };
      const resize = () => { const width = host.clientWidth; const height = host.clientHeight; camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix(); renderer?.setSize(width, height, false); };
      resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); resize();
      const startedAt = performance.now();
      const render = (now: number) => {
        if (disposed || !renderer) return;
        syncIfNeeded();
        const utcDayFraction = ((Date.now() / 1000) % 86_400) / 86_400;
        const solarAngle = utcDayFraction * TAU;
        // The globe's sun control changes actual scene lighting, rather than
        // tinting a tile overlay. It remains stable while the pilot orbits.
        sun.visible = propsRef.current.dayNightEnabled;
        sun.position.set(Math.cos(solarAngle) * 4, 2.4, Math.sin(solarAngle) * 4);
        ambient.intensity = propsRef.current.dayNightEnabled ? 0.95 : 1.5;
        const cloudOptions = propsRef.current.cloudSettings;
        clouds.visible = Boolean(propsRef.current.cloudsEnabled && propsRef.current.cloudData && cloudOptions.realWorld);
        cloudShadows.visible = clouds.visible;
        cloudMaterial.uniforms.uOpacity.value = cloudOptions.opacity;
        cloudMaterial.uniforms.uUseLow.value = cloudOptions.low ? 1 : 0;
        cloudMaterial.uniforms.uUseMiddle.value = cloudOptions.middle ? 1 : 0;
        cloudMaterial.uniforms.uUseHigh.value = cloudOptions.high ? 1 : 0;
        cloudMaterial.uniforms.uSelfShadow.value = cloudOptions.selfShadows ? 1 : 0;
        cloudMaterial.uniforms.uRelief.value = cloudOptions.enhancedPresentation ? 1.38 : 1;
        cloudMaterial.uniforms.uSteps.value = qualitySteps(cloudOptions);
        shadowMaterial.uniforms.uEnabled.value = cloudOptions.selfShadows ? 1 : 0;
        cloudMaterial.uniforms.uTime.value = (now - startedAt) / 1000;
        shadowMaterial.uniforms.uTime.value = (now - startedAt) / 1000;
        auroraMaterial.uniforms.uTime.value = (now - startedAt) / 1000 * propsRef.current.auroraSettings.animationSpeed;
        auroraMaterial.uniforms.uActivity.value = propsRef.current.auroraSettings.activity;
        auroraMaterial.uniforms.uEnhanced.value = propsRef.current.auroraSettings.enhancedPresentation ? 1 : 0.35;
        auroraMaterial.uniforms.uBrightness.value = propsRef.current.auroraSettings.brightness;
        cloudMaterial.uniforms.uCameraLocal.value.copy(camera.position); globe.worldToLocal(cloudMaterial.uniforms.uCameraLocal.value);
        renderer.render(scene, camera); animationId = requestAnimationFrame(render);
      };
      animationId = requestAnimationFrame(render);
    };
    void start();
    return () => {
      disposed = true; cancelAnimationFrame(animationId); cleanupPointer(); resizeObserver?.disconnect();
      renderer?.dispose(); if (container.current) container.current.replaceChildren();
    };
  }, []);
  return <div className="ba-radar-globe-map ba-radar-globe-three" ref={container}><div className="ba-radar-globe-caption"><strong>3D atmosphere</strong><span>Live BAV tracks · drag to orbit · scroll to zoom</span></div></div>;
}
