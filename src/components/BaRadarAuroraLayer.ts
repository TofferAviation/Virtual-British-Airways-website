import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import type { RadarAuroraData } from "@/lib/radar-external";

type AuroraColumn = { key: number; longitude: number; latitude: number; strength: number; phase: number };
type ProgramBundle = {
  program: WebGLProgram;
  position: number;
  field: number;
  fallbackMatrix: WebGLUniformLocation | null;
  projectionMatrix: WebGLUniformLocation | null;
  tileMercatorCoordinates: WebGLUniformLocation | null;
  clippingPlane: WebGLUniformLocation | null;
  transition: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
};

// These ranges follow the visible layers of an aurora: violet at the lower
// edge, green through the main 100–150 km curtain and diffuse red above it.
const curtainFloorMetres = 85_000;
const curtainCeilingMetres = 300_000;
const bucketWidthDegrees = 1;
const curtainHeightSegments = 4;

function mercatorCoordinate(longitude: number, latitude: number): [number, number] {
  const x = (longitude + 180) / 360;
  const clippedLatitude = Math.max(-85, Math.min(85, latitude));
  const radians = clippedLatitude * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2;
  return [x, y];
}

function createAuroraMesh(data: RadarAuroraData | null) {
  if (!data?.samples.length) return new Float32Array();
  const columns = new Map<number, { weightedLatitude: number; weight: number; peak: number }>();
  for (const sample of data.samples) {
    if (!Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude) || sample.latitude > 84.8 || sample.latitude < 45 || sample.probability < 5) continue;
    const longitude = sample.longitude > 180 ? sample.longitude - 360 : sample.longitude;
    const key = Math.max(0, Math.min(359, Math.floor((longitude + 180) / bucketWidthDegrees)));
    const column = columns.get(key) ?? { weightedLatitude: 0, weight: 0, peak: 0 };
    const weight = sample.probability * sample.probability;
    column.weightedLatitude += sample.latitude * weight;
    column.weight += weight;
    column.peak = Math.max(column.peak, sample.probability);
    columns.set(key, column);
  }

  const raw = [...columns.entries()]
    .flatMap(([key, column]) => {
      const strength = Math.max(0, Math.min(1, (column.peak - 4) / 18));
      if (!column.weight || strength < 0.025) return [];
      return [{
        key,
        longitude: -180 + (key + 0.5) * bucketWidthDegrees,
        latitude: column.weightedLatitude / column.weight,
        strength,
        phase: key * 0.079,
      }];
    })
    .sort((left, right) => left.key - right.key);
  if (raw.length < 2) return new Float32Array();

  // OVATION is an intensity field rather than an optical photo. A tiny
  // circular smoothing pass preserves the live oval while avoiding a
  // polygonal, cell-by-cell appearance.
  const ordered = raw.map((column, index) => {
    const previous = raw[(index - 1 + raw.length) % raw.length];
    const next = raw[(index + 1) % raw.length];
    if (Math.abs(previous.key - column.key) > 2 || Math.abs(next.key - column.key) > 2) return column;
    return {
      ...column,
      latitude: previous.latitude * 0.22 + column.latitude * 0.56 + next.latitude * 0.22,
      strength: previous.strength * 0.18 + column.strength * 0.64 + next.strength * 0.18,
    };
  });

  const vertices: number[] = [];
  const append = (column: AuroraColumn, latitudeOffset: number, height: number, intensity: number, ribbon: number) => {
    const [x, y] = mercatorCoordinate(column.longitude, column.latitude + latitudeOffset);
    vertices.push(x, y, height, Math.max(0, Math.min(1, column.strength * intensity)), column.phase, ribbon);
  };
  const appendQuad = (
    left: AuroraColumn,
    right: AuroraColumn,
    leftLatitude: number,
    rightLatitude: number,
    bottom: number,
    top: number,
    intensity: number,
    ribbon: number,
  ) => {
    // A handful of height segments gives the GPU enough vertices to turn a
    // ribbon into a moving drape. It is dramatically lighter than the old
    // planet-wide horizontal emission sheets, even at close zoom.
    for (let segment = 0; segment < curtainHeightSegments; segment += 1) {
      const lower = bottom + (top - bottom) * segment / curtainHeightSegments;
      const upper = bottom + (top - bottom) * (segment + 1) / curtainHeightSegments;
      append(left, leftLatitude, lower, intensity, ribbon);
      append(right, rightLatitude, lower, intensity, ribbon);
      append(right, rightLatitude, upper, intensity, ribbon);
      append(left, leftLatitude, lower, intensity, ribbon);
      append(right, rightLatitude, upper, intensity, ribbon);
      append(left, leftLatitude, upper, intensity, ribbon);
    }
  };

  // Real aurora looks like a collection of suspended curtains, not a stack of
  // flat rings. These lightweight ribbons are all vertical; the shader gives
  // them independent motion and soft, irregular edges.
  const curtainRibbons = [
    { latitudeOffset: -1.34, bottom: 102_000, top: 208_000, intensity: 0.14, ribbon: -3 },
    { latitudeOffset: -0.78, bottom: 90_000, top: 244_000, intensity: 0.25, ribbon: -2 },
    { latitudeOffset: -0.34, bottom: 88_000, top: 278_000, intensity: 0.38, ribbon: -1 },
    { latitudeOffset: 0, bottom: 92_000, top: 300_000, intensity: 0.48, ribbon: 0 },
    { latitudeOffset: 0.36, bottom: 96_000, top: 286_000, intensity: 0.38, ribbon: 1 },
    { latitudeOffset: 0.84, bottom: 104_000, top: 258_000, intensity: 0.24, ribbon: 2 },
    { latitudeOffset: 1.38, bottom: 116_000, top: 222_000, intensity: 0.13, ribbon: 3 },
  ];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = ordered[index];
    const right = ordered[index + 1];
    const consecutive = right.key - left.key <= 2;
    if (!consecutive || Math.abs(right.latitude - left.latitude) > 7) continue;
    const curtainStrength = Math.min(left.strength, right.strength);
    if (curtainStrength >= 0.035) {
      for (const curtain of curtainRibbons) {
        appendQuad(
          left,
          right,
          curtain.latitudeOffset,
          curtain.latitudeOffset,
          curtain.bottom,
          curtain.top,
          curtain.intensity,
          curtain.ribbon,
        );
      }
    }
  }
  return new Float32Array(vertices);
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create aurora shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

/**
 * GPU-first by design: the live NOAA field becomes a compact static set of
 * vertical ribbons and only their movement runs each frame. This avoids a
 * JavaScript particle loop while retaining a curved, high-altitude 3D aurora.
 */
export class BaRadarAuroraLayer implements CustomLayerInterface {
  readonly id = "ba-radar-globe-aurora-volume";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private buffer: WebGLBuffer | null = null;
  private programs = new Map<string, ProgramBundle>();
  private vertexCount = 0;
  private mesh = new Float32Array();
  private enabled = false;
  private nextFrame: number | null = null;
  private disposed = false;

  update(data: RadarAuroraData | null, enabled: boolean) {
    this.enabled = enabled;
    this.mesh = createAuroraMesh(data);
    this.vertexCount = this.mesh.length / 6;
    if (this.gl && this.buffer) this.uploadMesh();
    this.schedule();
    this.map?.triggerRepaint();
  }

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext) {
    // MapLibre supplies the page's own WebGL context. Duck-type here because
    // cross-realm browser contexts can make an otherwise valid WebGL2 context
    // fail an instanceof check.
    if (!("createVertexArray" in context)) {
      console.warn("BA-Radar aurora needs WebGL2; using the stable globe without the volumetric curtain.");
      return;
    }
    this.map = map;
    this.gl = context;
    this.buffer = context.createBuffer();
    this.uploadMesh();
    this.schedule();
  }

  onRemove() {
    this.disposed = true;
    if (this.nextFrame !== null) window.clearTimeout(this.nextFrame);
    if (this.gl && this.buffer) this.gl.deleteBuffer(this.buffer);
    for (const bundle of this.programs.values()) this.gl?.deleteProgram(bundle.program);
    this.programs.clear();
    this.buffer = null;
    this.gl = null;
    this.map = null;
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput) {
    if (!("createVertexArray" in context) || !this.enabled || !this.vertexCount || !this.buffer) return;
    const gl = context;
    let bundle: ProgramBundle;
    try {
      bundle = this.programFor(gl, options);
    } catch (error) {
      // A custom layer should fail quiet rather than breaking the flight map
      // on a browser with an incomplete WebGL implementation.
      this.enabled = false;
      console.warn("BA-Radar aurora shader could not start.", error);
      return;
    }
    const projection = options.defaultProjectionData;
    gl.useProgram(bundle.program);
    gl.uniformMatrix4fv(bundle.fallbackMatrix, false, projection.fallbackMatrix);
    gl.uniformMatrix4fv(bundle.projectionMatrix, false, projection.mainMatrix);
    gl.uniform4f(bundle.tileMercatorCoordinates, ...projection.tileMercatorCoords);
    gl.uniform4f(bundle.clippingPlane, ...projection.clippingPlane);
    gl.uniform1f(bundle.transition, projection.projectionTransition);
    const seconds = performance.now() / 1_000;
    // Keep direct manipulation responsive. While the pilot is moving the
    // globe, the map still redraws normally but the costly visual motion only
    // advances four times per second.
    gl.uniform1f(bundle.time, this.map?.isMoving() ? Math.floor(seconds * 4) / 4 : seconds);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(bundle.position);
    gl.vertexAttribPointer(bundle.position, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(bundle.field);
    gl.vertexAttribPointer(bundle.field, 3, gl.FLOAT, false, 24, 12);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.depthMask(true);
  }

  private uploadMesh() {
    if (!this.gl || !this.buffer) return;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.mesh, this.gl.STATIC_DRAW);
  }

  private schedule() {
    if (this.nextFrame !== null) window.clearTimeout(this.nextFrame);
    if (!this.map || this.disposed || !this.enabled) return;
    const device = navigator as Navigator & { deviceMemory?: number };
    const slowerDevice = (navigator.hardwareConcurrency ?? 4) <= 4 || (device.deviceMemory ?? 4) <= 4;
    this.nextFrame = window.setTimeout(() => {
      if (this.disposed) return;
      if (!document.hidden) this.map?.triggerRepaint();
      this.schedule();
    }, document.hidden ? 1_000 : this.map.isMoving() ? 220 : slowerDevice ? 120 : 84);
  }

  private programFor(gl: WebGL2RenderingContext, options: CustomRenderMethodInput): ProgramBundle {
    const key = options.shaderData.variantName;
    const existing = this.programs.get(key);
    if (existing) return existing;
    const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
${options.shaderData.vertexShaderPrelude}
${options.shaderData.define}
in vec3 a_position;
in vec3 a_field;
uniform float u_time;
out float v_strength;
out float v_height;
out float v_fold;
out float v_phase;
out float v_ribbon;
void main() {
  float heightRatio = clamp((a_position.z - ${curtainFloorMetres.toFixed(1)}) / ${(curtainCeilingMetres - curtainFloorMetres).toFixed(1)}, 0.0, 1.0);
  float ribbon = a_field.z;
  float midCurtain = sin(3.14159 * heightRatio);
  // The wide swells move an entire curtain, while higher-frequency folds run
  // through it. Each ribbon receives its own phase so they separate and weave
  // together like the reference footage rather than fading as one circular band.
  float broadWave = sin(a_field.y * 0.46 + u_time * 0.072 + ribbon * 0.86) * 0.66 + sin(a_field.y * 1.37 - u_time * 0.047 - ribbon * 0.43) * 0.24;
  float travellingFold = sin(a_field.y * 1.52 + heightRatio * 8.7 - u_time * 0.19 + ribbon * 1.7) * 0.42 + sin(a_field.y * 3.36 - heightRatio * 5.4 + u_time * 0.11 - ribbon) * 0.17;
  float extraHeight = (broadWave * 0.82 + travellingFold * 0.18) * (7000.0 + a_field.x * 22000.0) * mix(0.34, 1.0, midCurtain);
  float lateralWander = broadWave * 0.62 + travellingFold * 0.38;
  // The oval itself can meander by roughly one to two degrees at peak energy,
  // which is a realistic scale for moving auroral arcs rather than a perfect
  // mathematical ring.
  float lateralOffset = (ribbon * 0.00070 + lateralWander * (0.00092 + a_field.x * 0.00180)) * mix(0.24, 1.0, midCurtain);
  // Preserve depth for a real 3D custom layer. MapLibre then handles the
  // Earth horizon correctly as the pilot orbits instead of clipping the
  // aurora as if it were a surface image.
  gl_Position = projectTileFor3D(a_position.xy + vec2(0.0, lateralOffset), a_position.z + extraHeight);
  v_strength = a_field.x;
  v_height = heightRatio;
  v_fold = travellingFold;
  v_phase = a_field.y;
  v_ribbon = ribbon;
}`);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in float v_strength;
in float v_height;
in float v_fold;
in float v_phase;
in float v_ribbon;
uniform float u_time;
out vec4 fragColor;
void main() {
  float lowerFade = smoothstep(0.0, 0.09, v_height);
  float upperFade = 1.0 - smoothstep(0.82, 1.0, v_height);
  float filament = 0.74 + 0.26 * sin(v_fold * 1.34 + u_time * 0.083 + v_ribbon);
  // Different height phases prevent the gaps ending as ruler-straight lines:
  // they drift upward, split, and reconnect through each curtain.
  float driftingCells = sin(v_phase * 0.72 + u_time * 0.15 + v_ribbon * 0.9) * 0.54;
  float braidedCurtain = sin(v_phase * 1.46 + v_height * 9.4 - u_time * 0.21 - v_ribbon) * 0.31 + sin(v_phase * 3.82 - v_height * 15.0 + u_time * 0.12 + v_ribbon * 0.7) * 0.15;
  // A broad, shared activity front introduces genuine calm gaps around the
  // oval. Its height variation keeps each fading edge loose and diagonal,
  // rather than ending every ribbon at the same straight longitude.
  float broadActivity = sin(v_phase * 0.58 + v_height * 2.8 + u_time * 0.068) * 0.58 + sin(v_phase * 1.74 - v_height * 5.3 - u_time * 0.043) * 0.30 + sin(v_phase * 3.12 + v_height * 1.7 + u_time * 0.10) * 0.12;
  float broadArcMask = smoothstep(-0.16, 0.45, broadActivity);
  float reconnectingArc = mix(0.018, 1.0, broadArcMask) * mix(0.035, 1.0, smoothstep(-0.38, 0.46, driftingCells + braidedCurtain));
  // Fine travelling rays sit inside the broad curtain and move at a different
  // phase for every ribbon. This is what lets one strand peel away while its
  // neighbours remain, then braid back together a moment later.
  float travellingRays = sin(v_phase * 5.60 + v_height * 4.8 - u_time * 0.27 + v_ribbon * 2.3);
  float splittingStrands = mix(0.14, 1.0, smoothstep(-0.12, 0.76, travellingRays));
  float fineRipples = 0.78 + 0.22 * sin(v_phase * 5.2 + v_height * 18.0 - u_time * 0.25 + v_ribbon * 1.9);
  float energy = smoothstep(0.04, 0.78, v_strength);
  float alpha = (0.025 + energy * 0.42) * pow(energy, 0.70) * lowerFade * upperFade * filament * reconnectingArc * splittingStrands * fineRipples;
  vec3 oxygenGreen = mix(vec3(0.03, 0.24, 0.22), vec3(0.36, 1.0, 0.56), clamp(v_strength * 1.2, 0.0, 1.0));
  vec3 nitrogenViolet = vec3(0.44, 0.26, 0.90);
  vec3 highAltitudeRed = vec3(0.95, 0.18, 0.36);
  float violetMix = smoothstep(0.84, 1.0, v_strength) * (1.0 - smoothstep(0.03, 0.14, v_height));
  float redMix = smoothstep(0.86, 1.0, v_strength) * smoothstep(0.80, 0.98, v_height);
  vec3 colour = mix(oxygenGreen, nitrogenViolet, violetMix * 0.28);
  colour = mix(colour, highAltitudeRed, redMix * 0.35);
  // The map uses standard source-alpha blending, so keep RGB un-premultiplied.
  // Premultiplying here would dim a faint curtain twice.
  fragColor = vec4(colour, alpha);
}`);
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to create aurora program.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) ?? "Unknown program error";
      gl.deleteProgram(program);
      throw new Error(message);
    }
    const bundle = {
      program,
      position: gl.getAttribLocation(program, "a_position"),
      field: gl.getAttribLocation(program, "a_field"),
      fallbackMatrix: gl.getUniformLocation(program, "u_projection_fallback_matrix"),
      projectionMatrix: gl.getUniformLocation(program, "u_projection_matrix"),
      tileMercatorCoordinates: gl.getUniformLocation(program, "u_projection_tile_mercator_coords"),
      clippingPlane: gl.getUniformLocation(program, "u_projection_clipping_plane"),
      transition: gl.getUniformLocation(program, "u_projection_transition"),
      time: gl.getUniformLocation(program, "u_time"),
    } satisfies ProgramBundle;
    this.programs.set(key, bundle);
    return bundle;
  }
}
