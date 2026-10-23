import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import type { RadarCloudData, RadarCloudLayerId } from "@/lib/radar-external";
import { resolveCloudRendererQuality, type CloudRendererQuality } from "@/lib/radar-cloud-math";

export type CloudQuality = CloudRendererQuality;
export type CloudDebugMode = "lit" | "coverage" | "density" | "height" | "lighting" | "mesh";

export type CloudSettings = {
  realWorld: boolean;
  opacity: number;
  quality: CloudQuality;
  low: boolean;
  middle: boolean;
  high: boolean;
  selfShadows: boolean;
  /** A deliberately opt-in, modest vertical relief boost for a full-globe view. */
  enhancedPresentation: boolean;
  /** Available only in the development-only cloud inspector. */
  debugMode: CloudDebugMode;
};

export const DEFAULT_CLOUD_SETTINGS: CloudSettings = {
  realWorld: true,
  opacity: 0.72,
  quality: "auto",
  low: true,
  middle: true,
  high: true,
  selfShadows: true,
  enhancedPresentation: false,
  debugMode: "lit",
};

type QualityProfile = { stepDegrees: number; slices: number; repaintMs: number };
type VolumeTexture = { volume: WebGLTexture };
type VolumeMesh = { vertices: Float32Array; verticesPerSlice: number; slices: number };
type ProgramBundle = {
  program: WebGLProgram;
  position: number;
  fallbackMatrix: WebGLUniformLocation | null;
  projectionMatrix: WebGLUniformLocation | null;
  tileMercatorCoordinates: WebGLUniformLocation | null;
  clippingPlane: WebGLUniformLocation | null;
  transition: WebGLUniformLocation | null;
  weather: WebGLUniformLocation | null;
  weatherLow: WebGLUniformLocation | null;
  weatherMiddle: WebGLUniformLocation | null;
  weatherHigh: WebGLUniformLocation | null;
  geometry: WebGLUniformLocation | null;
  opacity: WebGLUniformLocation | null;
  selfShadow: WebGLUniformLocation | null;
  enhancedPresentation: WebGLUniformLocation | null;
  layerKind: WebGLUniformLocation | null;
  sliceCount: WebGLUniformLocation | null;
  debugMode: WebGLUniformLocation | null;
  meshStep: WebGLUniformLocation | null;
  solarTime: WebGLUniformLocation | null;
  solarDeclination: WebGLUniformLocation | null;
};

const TAU = Math.PI * 2;
const MAX_MERCATOR_LATITUDE = 85;
const HEIGHT_SCALE_METRES = 100;

const QUALITY: Record<Exclude<CloudQuality, "auto">, QualityProfile> = {
  // Ordered slices are samples through a bounded cloud volume, not duplicate
  // surface decals. Desktop profiles use enough separation for parallax while
  // mobile keeps its small, stable fallback.
  low: { stepDegrees: 10, slices: 3, repaintMs: 900 },
  medium: { stepDegrees: 3, slices: 5, repaintMs: 900 },
  high: { stepDegrees: 1.25, slices: 12, repaintMs: 900 },
  ultra: { stepDegrees: 0.75, slices: 16, repaintMs: 900 },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function mercatorY(latitude: number) {
  const radians = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE) * Math.PI / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2;
}

function resolveQuality(requested: CloudQuality): Exclude<CloudQuality, "auto"> {
  const device = navigator as Navigator & { deviceMemory?: number };
  return resolveCloudRendererQuality(requested, {
    mobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
    memoryGb: device.deviceMemory,
    cores: navigator.hardwareConcurrency,
  });
}

function buildVolumeMesh(profile: QualityProfile): VolumeMesh {
  const columns = Math.ceil(360 / profile.stepDegrees);
  const rows = Math.ceil((MAX_MERCATOR_LATITUDE * 2) / profile.stepDegrees);
  const verticesPerSlice = columns * rows * 6;
  const vertices = new Float32Array(verticesPerSlice * profile.slices * 3);
  let offset = 0;
  const appendShell = (leftLongitude: number, topLatitude: number, rightLongitude: number, bottomLatitude: number, slice: number) => {
    const left = (leftLongitude + 180) / 360;
    const right = (rightLongitude + 180) / 360;
    const top = mercatorY(topLatitude);
    const bottom = mercatorY(bottomLatitude);
    // A single, level-normalised shell is used for each slice. Keeping all
    // four corners at the same fractional height preserves the model's
    // vertical column instead of turning a grid cell into a diagonal plane.
    vertices[offset++] = left; vertices[offset++] = top; vertices[offset++] = slice;
    vertices[offset++] = right; vertices[offset++] = top; vertices[offset++] = slice;
    vertices[offset++] = right; vertices[offset++] = bottom; vertices[offset++] = slice;
    vertices[offset++] = left; vertices[offset++] = top; vertices[offset++] = slice;
    vertices[offset++] = right; vertices[offset++] = bottom; vertices[offset++] = slice;
    vertices[offset++] = left; vertices[offset++] = bottom; vertices[offset++] = slice;
  };
  // Lay each shell out contiguously. Rendering outside-in then integrates
  // the optically-thin volume in radial order instead of interleaving every
  // cell's low and high samples (which caused unstable transparent fog).
  for (let slice = 0; slice < profile.slices; slice += 1) {
    const sliceCentre = (slice + 0.5) / profile.slices;
    for (let row = 0; row < rows; row += 1) {
      const topLatitude = MAX_MERCATOR_LATITUDE - row * profile.stepDegrees;
      const bottomLatitude = Math.max(-MAX_MERCATOR_LATITUDE, topLatitude - profile.stepDegrees);
      for (let column = 0; column < columns; column += 1) {
        const leftLongitude = -180 + column * profile.stepDegrees;
        const rightLongitude = Math.min(180, leftLongitude + profile.stepDegrees);
        appendShell(leftLongitude, topLatitude, rightLongitude, bottomLatitude, sliceCentre);
      }
    }
  }
  return { vertices, verticesPerSlice, slices: profile.slices };
}

function decodeRgba(value: string, expectedBytes: number) {
  const decoded = atob(value);
  if (decoded.length !== expectedBytes) throw new Error("The GFS cloud texture was incomplete.");
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create the cloud shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown cloud shader error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createTexture(gl: WebGL2RenderingContext, width: number, height: number, values: Uint8Array) {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to allocate GFS cloud texture.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  // Mip filtering stops the GFS texture from aliasing into visible
  // stripes and blocks when a globe tile is viewed at an oblique distance.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, values);
  gl.generateMipmap(gl.TEXTURE_2D);
  const anisotropic = gl.getExtension("EXT_texture_filter_anisotropic");
  if (anisotropic) {
    const maximum = gl.getParameter(anisotropic.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number;
    gl.texParameterf(gl.TEXTURE_2D, anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, maximum));
  }
  return texture;
}

/**
 * Model-driven cloud renderer. NOAA GFS controls coverage, vertical extent,
 * humidity and condensate. It integrates the real model columns as ordered,
 * optically-thin shells; it never generates fake cloud coverage or drifts the
 * model across the globe between data refreshes.
 */
export class BaRadarCloudLayer implements CustomLayerInterface {
  readonly id = "ba-radar-globe-gfs-cloud-volumes";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private buffer: WebGLBuffer | null = null;
  private programs = new Map<string, ProgramBundle>();
  private textures = new Map<RadarCloudLayerId, VolumeTexture>();
  private mesh: Float32Array<ArrayBufferLike> = new Float32Array();
  private vertexCount = 0;
  private verticesPerSlice = 0;
  private meshSlices = 0;
  private enabled = false;
  private data: RadarCloudData | null = null;
  private settings: CloudSettings = { ...DEFAULT_CLOUD_SETTINGS };
  private resolvedQuality: Exclude<CloudQuality, "auto"> = "medium";
  private meshKey = "";
  private textureKey = "";
  private repaintTimer: number | null = null;
  private disposed = false;

  update(data: RadarCloudData | null, enabled: boolean, settings: CloudSettings = DEFAULT_CLOUD_SETTINGS) {
    this.data = data;
    this.enabled = enabled;
    // Merge in defaults so an in-place development update can safely add a
    // presentation option without leaving an older UI state half-defined.
    this.settings = { ...DEFAULT_CLOUD_SETTINGS, ...settings };
    this.resolvedQuality = resolveQuality(this.settings.quality);
    const meshKey = `${this.resolvedQuality}`;
    if (meshKey !== this.meshKey) {
      this.meshKey = meshKey;
      const mesh = buildVolumeMesh(QUALITY[this.resolvedQuality]);
      this.mesh = mesh.vertices;
      this.vertexCount = this.mesh.length / 3;
      this.verticesPerSlice = mesh.verticesPerSlice;
      this.meshSlices = mesh.slices;
      this.uploadMesh();
    }
    const textureKey = `${data?.fetchedAt ?? "empty"}:${data?.validAt ?? ""}:${data?.width ?? 0}:${data?.height ?? 0}`;
    if (textureKey !== this.textureKey) {
      this.textureKey = textureKey;
      this.uploadTextures();
    }
    this.scheduleRepaint();
    this.map?.triggerRepaint();
  }

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext) {
    if (!("createVertexArray" in context)) {
      console.warn("BA-Radar GFS clouds require WebGL2; the stable globe remains available.");
      return;
    }
    this.map = map;
    this.gl = context;
    this.buffer = context.createBuffer();
    this.uploadMesh();
    this.uploadTextures();
    this.scheduleRepaint();
  }

  onRemove() {
    this.disposed = true;
    if (this.repaintTimer !== null) window.clearTimeout(this.repaintTimer);
    if (this.gl && this.buffer) this.gl.deleteBuffer(this.buffer);
    for (const pair of this.textures.values()) {
      this.gl?.deleteTexture(pair.volume);
    }
    for (const bundle of this.programs.values()) this.gl?.deleteProgram(bundle.program);
    this.textures.clear();
    this.programs.clear();
    this.buffer = null;
    this.gl = null;
    this.map = null;
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput) {
    if (!("createVertexArray" in context) || !this.enabled || !this.settings.realWorld || !this.data || !this.vertexCount || !this.buffer) return;
    const gl = context;
    let bundle: ProgramBundle;
    try {
      bundle = this.programFor(gl, options);
    } catch (error) {
      this.enabled = false;
      console.warn("BA-Radar cloud shader could not start.", error);
      return;
    }
    const projection = options.defaultProjectionData;
    const now = new Date();
    const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 0);
    const dayOfYear = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - startOfYear) / 86_400_000;
    gl.useProgram(bundle.program);
    gl.uniformMatrix4fv(bundle.fallbackMatrix, false, projection.fallbackMatrix);
    gl.uniformMatrix4fv(bundle.projectionMatrix, false, projection.mainMatrix);
    gl.uniform4f(bundle.tileMercatorCoordinates, ...projection.tileMercatorCoords);
    gl.uniform4f(bundle.clippingPlane, ...projection.clippingPlane);
    gl.uniform1f(bundle.transition, projection.projectionTransition);
    gl.uniform1f(bundle.opacity, clamp(this.settings.opacity, 0, 1));
    gl.uniform1f(bundle.selfShadow, this.settings.selfShadows ? 1 : 0);
    gl.uniform1f(bundle.enhancedPresentation, this.settings.enhancedPresentation ? 1 : 0);
    gl.uniform1f(bundle.sliceCount, Math.max(1, this.meshSlices));
    gl.uniform1i(bundle.debugMode, this.settings.debugMode === "coverage" ? 1 : this.settings.debugMode === "density" ? 2 : this.settings.debugMode === "height" ? 3 : this.settings.debugMode === "lighting" ? 4 : this.settings.debugMode === "mesh" ? 5 : 0);
    gl.uniform1f(bundle.meshStep, QUALITY[this.resolvedQuality].stepDegrees);
    gl.uniform1f(bundle.solarTime, now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds());
    gl.uniform1f(bundle.solarDeclination, 0.409 * Math.sin(TAU * (dayOfYear - 81) / 365.25));
    // A tall convective column is supported only where all three GFS layers
    // report cloud. Binding those independent model fields lets the fragment
    // shader reveal real vertical co-location without fabricating storms.
    const lowVolume = this.textures.get("low")?.volume;
    const middleVolume = this.textures.get("middle")?.volume;
    const highVolume = this.textures.get("high")?.volume;
    if (!lowVolume || !middleVolume || !highVolume) return;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, lowVolume);
    gl.uniform1i(bundle.weatherLow, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, middleVolume);
    gl.uniform1i(bundle.weatherMiddle, 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, highVolume);
    gl.uniform1i(bundle.weatherHigh, 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(bundle.position);
    gl.vertexAttribPointer(bundle.position, 3, gl.FLOAT, false, 12, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const layers = [...this.data.layers].sort((left, right) => this.layerRank(right.id) - this.layerRank(left.id));
    for (const layer of layers) {
      if (!this.layerEnabled(layer.id)) continue;
      const textures = this.textures.get(layer.id);
      if (!textures) continue;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures.volume);
      gl.uniform1i(bundle.weather, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textures.volume);
      gl.uniform1i(bundle.geometry, 1);
      gl.uniform1f(bundle.layerKind, layer.id === "low" ? 0 : layer.id === "middle" ? 1 : 2);
      // The camera is outside the atmosphere, so descending radial shells are
      // a stable back-to-front approximation for each model cloud column.
      for (let slice = this.meshSlices - 1; slice >= 0; slice -= 1) {
        gl.drawArrays(gl.TRIANGLES, slice * this.verticesPerSlice, this.verticesPerSlice);
      }
    }
    gl.depthMask(true);
  }

  private layerEnabled(layer: RadarCloudLayerId) {
    return layer === "low" ? this.settings.low : layer === "middle" ? this.settings.middle : this.settings.high;
  }

  private layerRank(layer: RadarCloudLayerId) {
    return layer === "high" ? 2 : layer === "middle" ? 1 : 0;
  }

  private uploadMesh() {
    if (!this.gl || !this.buffer || !this.mesh.length) return;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.mesh, this.gl.STATIC_DRAW);
  }

  private uploadTextures() {
    if (!this.gl) return;
    for (const pair of this.textures.values()) {
      this.gl.deleteTexture(pair.volume);
    }
    this.textures.clear();
    if (!this.data) return;
    const expectedBytes = this.data.width * this.data.height * 4;
    try {
      for (const layer of this.data.layers) {
        this.textures.set(layer.id, { volume: createTexture(this.gl, this.data.width, this.data.height, decodeRgba(layer.volume, expectedBytes)) });
      }
    } catch (error) {
      console.warn("BA-Radar GFS cloud data could not be uploaded.", error);
      for (const pair of this.textures.values()) {
        this.gl.deleteTexture(pair.volume);
      }
      this.textures.clear();
    }
  }

  private scheduleRepaint() {
    if (this.repaintTimer !== null) window.clearTimeout(this.repaintTimer);
    if (!this.map || this.disposed || !this.enabled || !this.settings.realWorld || !this.vertexCount) return;
    const profile = QUALITY[this.resolvedQuality];
    this.repaintTimer = window.setTimeout(() => {
      if (this.disposed) return;
      // Pointer-driven MapLibre frames already render the volume while users
      // orbit the globe. Avoid a competing timer in that hot path.
      if (!document.hidden && !this.map?.isMoving()) this.map?.triggerRepaint();
      this.scheduleRepaint();
    }, document.hidden ? 1_000 : this.map.isMoving() ? Math.max(160, profile.repaintMs * 2) : profile.repaintMs);
  }

  private programFor(gl: WebGL2RenderingContext, options: CustomRenderMethodInput): ProgramBundle {
    const key = options.shaderData.variantName;
    const existing = this.programs.get(key);
    if (existing) return existing;
    const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
${options.shaderData.vertexShaderPrelude}
${options.shaderData.define}
in vec3 a_position;
uniform sampler2D u_geometry;
uniform float u_enhancedPresentation;
out vec2 v_geo;
out float v_densityHeight;
out float v_valid;
out float v_layerHeight;
void main() {
  float latitude = degrees(atan(sinh(3.14159265359 * (1.0 - 2.0 * a_position.y))));
  // Retain the east-edge value of 1.0. Fract() made the final longitude cell
  // interpolate through half the planet before texture wrapping occurred.
  v_geo = vec2(a_position.x, clamp((90.0 - latitude) / 180.0, 0.0, 1.0));
  vec4 geometry = texture(u_geometry, v_geo);
  float base = geometry.g * 255.0 * ${HEIGHT_SCALE_METRES.toFixed(1)};
  float top = geometry.b * 255.0 * ${HEIGHT_SCALE_METRES.toFixed(1)};
  // Keep the cloud base at its model altitude. The optional presentation mode
  // only expands thickness above that true base by a restrained 45%, making
  // deep layers legible from a full-globe camera without changing the data.
  float modelElevation = mix(base, top, a_position.z);
  float elevation = base + (modelElevation - base) * mix(1.0, 1.45, u_enhancedPresentation);
  gl_Position = projectTileFor3D(a_position.xy, elevation);
  v_densityHeight = a_position.z;
  v_valid = geometry.a * step(1.25, top / max(1.0, base));
  v_layerHeight = elevation;
}`);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in vec2 v_geo;
in float v_densityHeight;
in float v_valid;
in float v_layerHeight;
uniform sampler2D u_weather;
uniform sampler2D u_weatherLow;
uniform sampler2D u_weatherMiddle;
uniform sampler2D u_weatherHigh;
uniform float u_opacity;
uniform float u_selfShadow;
uniform float u_layerKind;
uniform float u_sliceCount;
uniform int u_debugMode;
uniform float u_meshStep;
uniform float u_solarTime;
uniform float u_solarDeclination;
out vec4 fragColor;
const float CLOUD_PI = 3.14159265359;
const float CLOUD_TAU = 6.28318530718;

// Fixed, low-cost value noise supplies sub-grid density inside a forecast
// column. It is anchored to geographic coordinates and never changes whether
// a column exists; GFS coverage remains the hard horizontal weather boundary.
float cloudHash(vec3 point) {
  point = fract(point * 0.1031);
  point += dot(point, point.yzx + 33.33);
  return fract((point.x + point.y) * point.z);
}

float cloudNoise(vec3 point) {
  vec3 cell = floor(point);
  vec3 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float n000 = cloudHash(cell + vec3(0.0, 0.0, 0.0));
  float n100 = cloudHash(cell + vec3(1.0, 0.0, 0.0));
  float n010 = cloudHash(cell + vec3(0.0, 1.0, 0.0));
  float n110 = cloudHash(cell + vec3(1.0, 1.0, 0.0));
  float n001 = cloudHash(cell + vec3(0.0, 0.0, 1.0));
  float n101 = cloudHash(cell + vec3(1.0, 0.0, 1.0));
  float n011 = cloudHash(cell + vec3(0.0, 1.0, 1.0));
  float n111 = cloudHash(cell + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, local.x), mix(n010, n110, local.x), local.y), mix(mix(n001, n101, local.x), mix(n011, n111, local.x), local.y), local.z);
}

void main() {
  vec4 weather = texture(u_weather, v_geo);
  float coverage = weather.r;
  float valid = weather.a * v_valid;
  if (valid < 0.5 || coverage < 0.035 || u_opacity < 0.01) discard;

  float modelCoverage = clamp(coverage * 0.86, 0.0, 1.0);
  float density = smoothstep(0.075, 0.82, modelCoverage);

  vec2 alignedGeo = vec2(v_geo.x * 1.35, v_geo.y);
  float alongScale = u_layerKind < 0.5 ? 75.0 : (u_layerKind < 1.5 ? 58.0 : 34.0);
  float acrossScale = u_layerKind < 0.5 ? 48.0 : (u_layerKind < 1.5 ? 38.0 : 17.0);
  // Adjacent ordered samples must stay strongly correlated through height.
  // Larger Z frequencies made each shell read as a separate stamped plane;
  // this slow vertical evolution instead produces coherent columns, gaps, and
  // a continuous cloud body as the camera changes angle.
  float verticalScale = u_layerKind < 0.5 ? 0.72 : (u_layerKind < 1.5 ? 0.48 : 0.32);
  vec3 volumeCoordinate = vec3(alignedGeo.x * alongScale, alignedGeo.y * acrossScale, v_densityHeight * verticalScale);
  float broadForm = cloudNoise(volumeCoordinate * 0.42 + vec3(19.0, 7.0, u_layerKind * 13.0));
  float fineForm = cloudNoise(volumeCoordinate * 1.38 + vec3(3.0, 29.0, 41.0));
  // Billow noise produces rounded cumulus-like erosion instead of a flat
  // cellular decal. It is detail within a real column, not a synthetic cloud.
  float billowForm = 1.0 - abs(cloudNoise(volumeCoordinate * 2.85 + vec3(61.0, 11.0, 5.0)) * 2.0 - 1.0);
  float structure = mix(mix(broadForm, fineForm, u_layerKind < 1.5 ? 0.31 : 0.18), billowForm, u_layerKind < 1.5 ? 0.24 : 0.13);
  // Density modulation is bounded and can only erode/densify an existing
  // model column. It makes transparent holes, clumps, and layered edges
  // visible when the camera moves through the ordered volume slices.
  float structureAmount = mix(0.26, 0.62, smoothstep(0.20, 0.92, modelCoverage));
  float interiorStructure = smoothstep(0.22, 0.80, structure * 0.92 + broadForm * 0.08);
  float densityModulation = mix(1.0, mix(0.30, 1.48, interiorStructure), structureAmount);
  density *= densityModulation;

  float lowerFalloff = smoothstep(0.015, 0.16, v_densityHeight);
  float upperFalloff = 1.0 - smoothstep(0.76, 1.0, v_densityHeight);
  float verticalCore = mix(0.52, 1.0, pow(sin(CLOUD_PI * clamp(v_densityHeight, 0.0, 1.0)), 0.72));
  float layerBody = u_layerKind < 0.5 ? 1.0 : (u_layerKind < 1.5 ? 0.84 : 0.67);
  density *= lowerFalloff * upperFalloff * verticalCore * layerBody;

  // Co-located low, middle, and high GFS coverage identifies the limited
  // parts of the model suitable for a deeper convective presentation. It is
  // intentionally an enhancement of an existing model storm column, never a
  // new cloud or a claim that GFS resolves an observed individual thunderhead.
  float stormCoverage = min(texture(u_weatherLow, v_geo).r, min(texture(u_weatherMiddle, v_geo).r, texture(u_weatherHigh, v_geo).r));
  float stormColumn = smoothstep(0.56, 0.90, stormCoverage);
  float towerCore = smoothstep(0.38, 0.86, broadForm) * stormColumn;
  density *= 1.0 + towerCore * (u_layerKind < 1.5 ? 0.34 : 0.20);
  if (density < 0.018) discard;

  float latitude = (0.5 - v_geo.y) * CLOUD_PI;
  float longitude = (v_geo.x - 0.5) * CLOUD_TAU;
  float solarLongitude = (0.5 - u_solarTime / 86400.0) * CLOUD_TAU;
  float solarElevation = sin(latitude) * sin(u_solarDeclination)
    + cos(latitude) * cos(u_solarDeclination) * cos(longitude - solarLongitude);
  float daylight = smoothstep(-0.13, 0.12, solarElevation);
  float twilight = smoothstep(-0.23, 0.03, solarElevation) * (1.0 - smoothstep(0.03, 0.24, solarElevation));
  float thickness = clamp(density * (0.38 + coverage * 0.55), 0.0, 1.0);
  float selfShadow = mix(1.0, 0.54 + 0.46 * exp(-thickness * 1.15), u_selfShadow);
  float silver = pow(max(0.0, solarElevation), 0.35) * (0.16 + (1.0 - thickness) * 0.84) * 0.38;
  float internalLight = mix(0.78, 1.10, structure) * (0.86 + 0.14 * towerCore);
  vec3 lowCloud = vec3(0.70, 0.73, 0.76);
  vec3 middleCloud = vec3(0.78, 0.79, 0.81);
  vec3 highCloud = vec3(0.84, 0.87, 0.91);
  vec3 baseColour = u_layerKind < 0.5 ? lowCloud : (u_layerKind < 1.5 ? middleCloud : highCloud);
  vec3 dayColour = baseColour * (0.45 + daylight * 0.65) * selfShadow * internalLight + vec3(0.25) * silver;
  vec3 duskColour = vec3(0.38, 0.26, 0.19) * twilight * (0.28 + (1.0 - thickness) * 0.44);
  vec3 nightColour = baseColour * 0.075;
  vec3 colour = mix(nightColour, dayColour + duskColour, daylight + twilight * 0.58);
  float layerOpticalDepth = u_layerKind < 0.5 ? 0.76 : (u_layerKind < 1.5 ? 0.52 : 0.34);
  float atmosphericFade = 1.0 - smoothstep(15000.0, 24000.0, v_layerHeight);
  float opticalDepth = density * layerOpticalDepth * u_opacity * (0.52 + daylight * 0.48) * atmosphericFade;
  float alpha = 1.0 - exp(-opticalDepth / max(1.0, u_sliceCount));
  if (u_debugMode == 1) {
    fragColor = vec4(vec3(coverage), max(alpha, 0.72));
    return;
  }
  if (u_debugMode == 2) {
    fragColor = vec4(vec3(density), max(alpha, 0.72));
    return;
  }
  if (u_debugMode == 3) {
    float relativeHeight = clamp(v_layerHeight / 24000.0, 0.0, 1.0);
    fragColor = vec4(vec3(relativeHeight, 1.0 - relativeHeight, 0.22), max(alpha, 0.72));
    return;
  }
  if (u_debugMode == 4) {
    fragColor = vec4(vec3(daylight, twilight, 1.0 - daylight), max(alpha, 0.72));
    return;
  }
  if (u_debugMode == 5) {
    vec2 grid = abs(fract(vec2(v_geo.x * 360.0, v_geo.y * 180.0) / u_meshStep) - 0.5);
    float edge = 1.0 - smoothstep(0.42, 0.49, max(grid.x, grid.y));
    fragColor = vec4(mix(colour, vec3(1.0, 0.24, 0.08), edge), max(alpha, edge * 0.88));
    return;
  }
  fragColor = vec4(colour, alpha);
}`);
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to link the cloud shader.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) ?? "Unknown cloud program error.";
      gl.deleteProgram(program);
      throw new Error(message);
    }
    const bundle: ProgramBundle = {
      program,
      position: gl.getAttribLocation(program, "a_position"),
      // MapLibre's globe projection prelude owns these exact uniforms. If
      // they are unset, a syntactically-valid cloud shader still projects all
      // volume slices offscreen in globe mode.
      fallbackMatrix: gl.getUniformLocation(program, "u_projection_fallback_matrix"),
      projectionMatrix: gl.getUniformLocation(program, "u_projection_matrix"),
      tileMercatorCoordinates: gl.getUniformLocation(program, "u_projection_tile_mercator_coords"),
      clippingPlane: gl.getUniformLocation(program, "u_projection_clipping_plane"),
      transition: gl.getUniformLocation(program, "u_projection_transition"),
      weather: gl.getUniformLocation(program, "u_weather"),
      weatherLow: gl.getUniformLocation(program, "u_weatherLow"),
      weatherMiddle: gl.getUniformLocation(program, "u_weatherMiddle"),
      weatherHigh: gl.getUniformLocation(program, "u_weatherHigh"),
      geometry: gl.getUniformLocation(program, "u_geometry"),
      opacity: gl.getUniformLocation(program, "u_opacity"),
      selfShadow: gl.getUniformLocation(program, "u_selfShadow"),
      enhancedPresentation: gl.getUniformLocation(program, "u_enhancedPresentation"),
      layerKind: gl.getUniformLocation(program, "u_layerKind"),
      sliceCount: gl.getUniformLocation(program, "u_sliceCount"),
      debugMode: gl.getUniformLocation(program, "u_debugMode"),
      meshStep: gl.getUniformLocation(program, "u_meshStep"),
      solarTime: gl.getUniformLocation(program, "u_solarTime"),
      solarDeclination: gl.getUniformLocation(program, "u_solarDeclination"),
    };
    this.programs.set(key, bundle);
    return bundle;
  }
}

