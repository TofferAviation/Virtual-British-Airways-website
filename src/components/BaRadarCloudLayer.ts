import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import type { RadarCloudData, RadarCloudLayerId } from "@/lib/radar-external";

export type CloudQuality = "auto" | "low" | "medium" | "high" | "ultra";

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
};

type QualityProfile = { stepDegrees: number; slices: number; repaintMs: number };
type TexturePair = { weather: WebGLTexture; geometry: WebGLTexture };
type ProgramBundle = {
  program: WebGLProgram;
  position: number;
  fallbackMatrix: WebGLUniformLocation | null;
  projectionMatrix: WebGLUniformLocation | null;
  tileMercatorCoordinates: WebGLUniformLocation | null;
  clippingPlane: WebGLUniformLocation | null;
  transition: WebGLUniformLocation | null;
  weather: WebGLUniformLocation | null;
  geometry: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  opacity: WebGLUniformLocation | null;
  selfShadow: WebGLUniformLocation | null;
  enhancedPresentation: WebGLUniformLocation | null;
  layerKind: WebGLUniformLocation | null;
  solarTime: WebGLUniformLocation | null;
  solarDeclination: WebGLUniformLocation | null;
};

const TAU = Math.PI * 2;
const MAX_MERCATOR_LATITUDE = 85;
const HEIGHT_SCALE_METRES = 100;
const WIND_RANGE_METRES_PER_SECOND = 80;

const QUALITY: Record<Exclude<CloudQuality, "auto">, QualityProfile> = {
  low: { stepDegrees: 10, slices: 2, repaintMs: 140 },
  medium: { stepDegrees: 4, slices: 4, repaintMs: 96 },
  high: { stepDegrees: 2.5, slices: 5, repaintMs: 66 },
  ultra: { stepDegrees: 1.5, slices: 6, repaintMs: 46 },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function mercatorY(latitude: number) {
  const radians = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE) * Math.PI / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2;
}

function resolveQuality(requested: CloudQuality): Exclude<CloudQuality, "auto"> {
  if (requested !== "auto") return requested;
  const device = navigator as Navigator & { deviceMemory?: number };
  const memory = device.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || memory <= 4 || cores <= 4) return "low";
  return memory >= 8 && cores >= 8 ? "high" : "medium";
}

function buildVolumeMesh(profile: QualityProfile) {
  const columns = Math.ceil(360 / profile.stepDegrees);
  const rows = Math.ceil((MAX_MERCATOR_LATITUDE * 2) / profile.stepDegrees);
  const vertices: number[] = [];
  const appendShell = (leftLongitude: number, topLatitude: number, rightLongitude: number, bottomLatitude: number, slice: number) => {
    const left = (leftLongitude + 180) / 360;
    const right = (rightLongitude + 180) / 360;
    const top = mercatorY(topLatitude);
    const bottom = mercatorY(bottomLatitude);
    // A single, level-normalised shell is used for each slice. Keeping all
    // four corners at the same fractional height preserves the model's
    // vertical column instead of turning a grid cell into a diagonal plane.
    vertices.push(left, top, slice, right, top, slice, right, bottom, slice);
    vertices.push(left, top, slice, right, bottom, slice, left, bottom, slice);
  };
  for (let row = 0; row < rows; row += 1) {
    const topLatitude = MAX_MERCATOR_LATITUDE - row * profile.stepDegrees;
    const bottomLatitude = Math.max(-MAX_MERCATOR_LATITUDE, topLatitude - profile.stepDegrees);
    for (let column = 0; column < columns; column += 1) {
      const leftLongitude = -180 + column * profile.stepDegrees;
      const rightLongitude = Math.min(180, leftLongitude + profile.stepDegrees);
      for (let slice = 0; slice < profile.slices; slice += 1) {
        // Separate curved shells are a bounded volume approximation. They
        // use the real model base/top per cell, so they retain parallax at
        // oblique views without CPU rebuilding as the camera moves.
        const sliceCentre = (slice + 0.5) / profile.slices;
        appendShell(leftLongitude, topLatitude, rightLongitude, bottomLatitude, sliceCentre);
      }
    }
  }
  return new Float32Array(vertices);
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, values);
  return texture;
}

/**
 * Model-driven cloud renderer. NOAA GFS controls coverage, vertical extent,
 * humidity, condensate and wind. The fragment shader adds only cloud-scale
 * erosion and lighting; it never creates coverage outside a valid GFS cell.
 */
export class BaRadarCloudLayer implements CustomLayerInterface {
  readonly id = "ba-radar-globe-gfs-cloud-volumes";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private buffer: WebGLBuffer | null = null;
  private programs = new Map<string, ProgramBundle>();
  private textures = new Map<RadarCloudLayerId, TexturePair>();
  private mesh = new Float32Array();
  private vertexCount = 0;
  private enabled = false;
  private data: RadarCloudData | null = null;
  private settings: CloudSettings = { ...DEFAULT_CLOUD_SETTINGS };
  private resolvedQuality: Exclude<CloudQuality, "auto"> = "medium";
  private meshKey = "";
  private textureKey = "";
  private repaintTimer: number | null = null;
  private disposed = false;
  private startedAt = 0;

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
      this.mesh = buildVolumeMesh(QUALITY[this.resolvedQuality]);
      this.vertexCount = this.mesh.length / 3;
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
    this.startedAt = performance.now();
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
      this.gl?.deleteTexture(pair.weather);
      this.gl?.deleteTexture(pair.geometry);
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
    gl.uniform1f(bundle.time, (performance.now() - this.startedAt) / 1_000);
    gl.uniform1f(bundle.opacity, clamp(this.settings.opacity, 0, 1));
    gl.uniform1f(bundle.selfShadow, this.settings.selfShadows ? 1 : 0);
    gl.uniform1f(bundle.enhancedPresentation, this.settings.enhancedPresentation ? 1 : 0);
    gl.uniform1f(bundle.solarTime, now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds());
    gl.uniform1f(bundle.solarDeclination, 0.409 * Math.sin(TAU * (dayOfYear - 81) / 365.25));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(bundle.position);
    gl.vertexAttribPointer(bundle.position, 3, gl.FLOAT, false, 12, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    for (const layer of this.data.layers) {
      if (!this.layerEnabled(layer.id)) continue;
      const textures = this.textures.get(layer.id);
      if (!textures) continue;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures.weather);
      gl.uniform1i(bundle.weather, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textures.geometry);
      gl.uniform1i(bundle.geometry, 1);
      gl.uniform1f(bundle.layerKind, layer.id === "low" ? 0 : layer.id === "middle" ? 1 : 2);
      gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    }
    gl.depthMask(true);
  }

  private layerEnabled(layer: RadarCloudLayerId) {
    return layer === "low" ? this.settings.low : layer === "middle" ? this.settings.middle : this.settings.high;
  }

  private uploadMesh() {
    if (!this.gl || !this.buffer || !this.mesh.length) return;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.mesh, this.gl.STATIC_DRAW);
  }

  private uploadTextures() {
    if (!this.gl) return;
    for (const pair of this.textures.values()) {
      this.gl.deleteTexture(pair.weather);
      this.gl.deleteTexture(pair.geometry);
    }
    this.textures.clear();
    if (!this.data) return;
    const expectedBytes = this.data.width * this.data.height * 4;
    try {
      for (const layer of this.data.layers) {
        this.textures.set(layer.id, {
          weather: createTexture(this.gl, this.data.width, this.data.height, decodeRgba(layer.weather, expectedBytes)),
          geometry: createTexture(this.gl, this.data.width, this.data.height, decodeRgba(layer.geometry, expectedBytes)),
        });
      }
    } catch (error) {
      console.warn("BA-Radar GFS cloud data could not be uploaded.", error);
      for (const pair of this.textures.values()) {
        this.gl.deleteTexture(pair.weather);
        this.gl.deleteTexture(pair.geometry);
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
uniform float u_time;
uniform float u_enhancedPresentation;
out vec2 v_geo;
out float v_densityHeight;
out float v_humidity;
out float v_condensate;
out float v_valid;
out float v_layerHeight;
const float CLOUD_PI = 3.14159265359;
float mercatorY(float latitude) {
  float radians = clamp(latitude, -85.0, 85.0) * CLOUD_PI / 180.0;
  return (1.0 - log(tan(CLOUD_PI * 0.25 + radians * 0.5)) / CLOUD_PI) * 0.5;
}
void main() {
  float latitude = degrees(atan(sinh(CLOUD_PI * (1.0 - 2.0 * a_position.y))));
  v_geo = vec2(fract(a_position.x), clamp((90.0 - latitude) / 180.0, 0.0, 1.0));
  vec4 geometry = texture(u_geometry, v_geo);
  float base = geometry.r * 255.0 * ${HEIGHT_SCALE_METRES.toFixed(1)};
  float top = geometry.g * 255.0 * ${HEIGHT_SCALE_METRES.toFixed(1)};
  float windEast = geometry.b * 160.0 - ${WIND_RANGE_METRES_PER_SECOND.toFixed(1)};
  float windNorth = geometry.a * 160.0 - ${WIND_RANGE_METRES_PER_SECOND.toFixed(1)};
  // One visual second represents six seconds of steady model-wind drift.
  // It only shifts sub-grid texture detail; GFS coverage and model heights
  // stay fixed to the forecast grid until the next model refresh.
  float driftSeconds = u_time * 6.0;
  float latitudeDrift = windNorth * driftSeconds / 111000.0;
  float longitudeDrift = windEast * driftSeconds / max(19000.0, 111000.0 * cos(latitude * CLOUD_PI / 180.0));
  // Keep the cloud base at its model altitude. The optional presentation mode
  // only expands thickness above that true base by a restrained 45%, making
  // deep layers legible from a full-globe camera without changing the data.
  float modelElevation = mix(base, top, a_position.z);
  float elevation = base + (modelElevation - base) * mix(1.0, 1.45, u_enhancedPresentation);
  vec2 position = vec2(a_position.x + longitudeDrift / 360.0, mercatorY(latitude + latitudeDrift));
  gl_Position = projectTileFor3D(position, elevation);
  v_densityHeight = a_position.z;
  v_humidity = geometry.r + geometry.g; // retained only to vary vertex interpolation continuously
  v_condensate = geometry.b;
  v_valid = step(1.25, top / max(1.0, base));
  v_layerHeight = elevation;
}`);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in vec2 v_geo;
in float v_densityHeight;
in float v_humidity;
in float v_condensate;
in float v_valid;
in float v_layerHeight;
uniform sampler2D u_weather;
uniform float u_time;
uniform float u_opacity;
uniform float u_selfShadow;
uniform float u_layerKind;
uniform float u_solarTime;
uniform float u_solarDeclination;
out vec4 fragColor;
const float CLOUD_PI = 3.14159265359;
const float CLOUD_TAU = 6.28318530718;
void main() {
  vec4 weather = texture(u_weather, v_geo);
  float coverage = weather.r;
  float humidity = weather.g;
  float condensate = weather.b;
  float valid = weather.a * v_valid;
  if (valid < 0.5 || coverage < 0.035 || u_opacity < 0.01) discard;
  // The GFS coverage field is deliberately the whole horizontal shape. The
  // prior procedural noise created a stamped, camouflage-like pattern that
  // implied weather not present in the model. Linear texture filtering gives
  // the 1-degree forecast its correct, smooth synoptic boundaries instead.
  float moisture = clamp(0.68 + humidity * 0.22 + condensate * 0.22, 0.55, 1.08);
  float modelCoverage = clamp(coverage * moisture, 0.0, 1.0);
  float density = smoothstep(0.075, 0.82, modelCoverage);
  // Give the model column real vertical extent without inventing a separate
  // horizontal pattern at every slice. Low cloud is fuller; high ice cloud
  // stays light and diffuse through its pressure-derived thickness.
  float lowerFalloff = smoothstep(0.01, 0.18, v_densityHeight);
  float upperFalloff = 1.0 - smoothstep(0.76, 1.0, v_densityHeight);
  float verticalCore = mix(0.54, 1.0, pow(sin(CLOUD_PI * clamp(v_densityHeight, 0.0, 1.0)), 0.72));
  float layerBody = u_layerKind < 0.5 ? 1.0 : (u_layerKind < 1.5 ? 0.84 : 0.67);
  density *= lowerFalloff * upperFalloff * verticalCore * layerBody;
  if (density < 0.018) discard;
  float latitude = (0.5 - v_geo.y) * CLOUD_PI;
  float longitude = (v_geo.x - 0.5) * CLOUD_TAU;
  float solarLongitude = (0.5 - u_solarTime / 86400.0) * CLOUD_TAU;
  float solarElevation = sin(latitude) * sin(u_solarDeclination)
    + cos(latitude) * cos(u_solarDeclination) * cos(longitude - solarLongitude);
  float daylight = smoothstep(-0.13, 0.12, solarElevation);
  float twilight = smoothstep(-0.23, 0.03, solarElevation) * (1.0 - smoothstep(0.03, 0.24, solarElevation));
  float thickness = clamp(density * (0.38 + coverage * 0.55), 0.0, 1.0);
  // A cloud casts some of its own light into nearby volume slices. Keeping
  // self-shadow intentionally restrained avoids a dark, flat overcast sheet.
  float selfShadow = mix(1.0, 0.54 + 0.46 * exp(-thickness * 1.15), u_selfShadow);
  float silver = pow(max(0.0, solarElevation), 0.35) * (0.24 + (1.0 - thickness) * 0.76) * 0.34;
  vec3 lowCloud = vec3(0.71, 0.74, 0.76);
  vec3 middleCloud = vec3(0.78, 0.79, 0.80);
  vec3 highCloud = vec3(0.83, 0.86, 0.89);
  vec3 baseColour = u_layerKind < 0.5 ? lowCloud : (u_layerKind < 1.5 ? middleCloud : highCloud);
  vec3 dayColour = baseColour * (0.47 + daylight * 0.63) * selfShadow + vec3(0.24) * silver;
  vec3 duskColour = vec3(0.38, 0.26, 0.19) * twilight * (0.32 + (1.0 - thickness) * 0.4);
  vec3 nightColour = baseColour * 0.075;
  vec3 colour = mix(nightColour, dayColour + duskColour, daylight + twilight * 0.58);
  // More distant high clouds can remain thin; lower dense layers receive a
  // little more opacity but never emit light on the night side.
  float layerOpacity = u_layerKind < 0.5 ? 0.25 : (u_layerKind < 1.5 ? 0.19 : 0.13);
  float atmosphericFade = 1.0 - smoothstep(15000.0, 24000.0, v_layerHeight);
  float alpha = density * layerOpacity * u_opacity * (0.52 + daylight * 0.48) * atmosphericFade;
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
      geometry: gl.getUniformLocation(program, "u_geometry"),
      time: gl.getUniformLocation(program, "u_time"),
      opacity: gl.getUniformLocation(program, "u_opacity"),
      selfShadow: gl.getUniformLocation(program, "u_selfShadow"),
      enhancedPresentation: gl.getUniformLocation(program, "u_enhancedPresentation"),
      layerKind: gl.getUniformLocation(program, "u_layerKind"),
      solarTime: gl.getUniformLocation(program, "u_solarTime"),
      solarDeclination: gl.getUniformLocation(program, "u_solarDeclination"),
    };
    this.programs.set(key, bundle);
    return bundle;
  }
}

