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

const curtainFloorMetres = 96_000;
const curtainCeilingMetres = 218_000;
const bucketWidthDegrees = 1;

function mercatorCoordinate(longitude: number, latitude: number): [number, number] {
  const x = (longitude + 180) / 360;
  const clippedLatitude = Math.max(-85, Math.min(85, latitude));
  const radians = clippedLatitude * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2;
  return [x, y];
}

function createAuroraMesh(data: RadarAuroraData | null) {
  if (!data?.samples.length) return new Float32Array();
  const fieldCells = new Map<string, number>();
  const fieldKey = (longitude: number, latitude: number) => {
    const wrappedLongitude = ((Math.round(longitude) + 180) % 360 + 360) % 360 - 180;
    return `${wrappedLongitude}:${Math.round(latitude)}`;
  };
  for (const sample of data.samples) {
    if (!Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude) || sample.latitude < 45 || sample.latitude > 85) continue;
    const key = fieldKey(sample.longitude > 180 ? sample.longitude - 360 : sample.longitude, sample.latitude);
    fieldCells.set(key, Math.max(fieldCells.get(key) ?? 0, sample.probability));
  }
  const fieldStrengthAt = (longitude: number, latitude: number) => {
    // Smooth the source grid into a continuous emission field. The display
    // curve is deliberately perceptual: it preserves the NOAA ratios while
    // making a low-but-real probability field visible against space.
    let total = 0;
    let weight = 0;
    for (let latitudeOffset = -1; latitudeOffset <= 1; latitudeOffset += 1) {
      for (let longitudeOffset = -1; longitudeOffset <= 1; longitudeOffset += 1) {
        const sampleWeight = latitudeOffset === 0 && longitudeOffset === 0 ? 0.42 : latitudeOffset === 0 || longitudeOffset === 0 ? 0.105 : 0.04;
        total += (fieldCells.get(fieldKey(longitude + longitudeOffset, latitude + latitudeOffset)) ?? 0) * sampleWeight;
        weight += sampleWeight;
      }
    }
    return Math.pow(Math.max(0, total / weight) / 100, 0.45);
  };
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
  const append = (column: AuroraColumn, latitudeOffset: number, height: number, intensity = 1, longitudeOffset = 0) => {
    const [x, y] = mercatorCoordinate(column.longitude + longitudeOffset, column.latitude + latitudeOffset);
    vertices.push(x, y, height, Math.max(0, Math.min(1, column.strength * intensity)), column.phase);
  };
  const appendQuad = (
    left: AuroraColumn,
    right: AuroraColumn,
    leftLatitude: number,
    rightLatitude: number,
    bottom: number,
    top: number,
    leftIntensity = 1,
    rightIntensity = 1,
    seam = false,
  ) => {
    const longitudeOffset = seam ? 360 : 0;
    append(left, leftLatitude, bottom, leftIntensity);
    append(right, rightLatitude, bottom, rightIntensity, longitudeOffset);
    append(right, rightLatitude, top, rightIntensity, longitudeOffset);
    append(left, leftLatitude, bottom, leftIntensity);
    append(right, rightLatitude, top, rightIntensity, longitudeOffset);
    append(left, leftLatitude, top, leftIntensity);
  };
  const appendField = (longitude: number, latitude: number, height: number, strength: number) => {
    const [x, y] = mercatorCoordinate(longitude, latitude);
    vertices.push(x, y, height, Math.max(0, Math.min(1, strength)), (longitude + 180) * 0.079);
  };
  const appendFieldQuad = (
    west: number,
    east: number,
    south: number,
    north: number,
    southwest: number,
    southeast: number,
    northwest: number,
    northeast: number,
    height: number,
    opacity: number,
  ) => {
    appendField(west, south, height, southwest * opacity);
    appendField(east, south, height, southeast * opacity);
    appendField(east, north, height, northeast * opacity);
    appendField(west, south, height, southwest * opacity);
    appendField(east, north, height, northeast * opacity);
    appendField(west, north, height, northwest * opacity);
  };

  // The narrow vertical sheets are the real 3D component. One face per live
  // field segment is enough: the shader interpolates smoothly up the curtain,
  // avoiding the horizontal striping that a stack of little rectangles creates.
  for (let index = 0; index < ordered.length; index += 1) {
    const left = ordered[index];
    const right = ordered[(index + 1) % ordered.length];
    const seam = index === ordered.length - 1 && right.key + 360 - left.key <= 2;
    const consecutive = seam || right.key - left.key <= 2;
    if (!consecutive || Math.abs(right.latitude - left.latitude) > 7) continue;
    const curtainStrength = Math.min(left.strength, right.strength);
    if (curtainStrength >= 0.12) {
      appendQuad(left, right, 0, 0, curtainFloorMetres, curtainCeilingMetres, 1, 1, seam);
    }

  }

  // The actual NOAA field is drawn as elevated atmospheric-emission sheets,
  // not as a hard-edged heatmap. A two-degree longitude mesh is dense enough
  // to preserve an auroral curve yet stays well below the cost of a full map
  // tile layer. The three atmospheric heights give it visible depth from an
  // orbital viewpoint; shader movement makes the sheets flow together.
  for (let longitude = -180; longitude < 180; longitude += 2) {
    for (let latitude = 45; latitude < 85; latitude += 1) {
      const southwest = fieldStrengthAt(longitude, latitude);
      const southeast = fieldStrengthAt(longitude + 2, latitude);
      const northwest = fieldStrengthAt(longitude, latitude + 1);
      const northeast = fieldStrengthAt(longitude + 2, latitude + 1);
      if (Math.max(southwest, southeast, northwest, northeast) < 0.08) continue;
      appendFieldQuad(longitude, longitude + 2, latitude, latitude + 1, southwest, southeast, northwest, northeast, 112_000, 0.26);
      appendFieldQuad(longitude, longitude + 2, latitude, latitude + 1, southwest, southeast, northwest, northeast, 131_000, 1);
      appendFieldQuad(longitude, longitude + 2, latitude, latitude + 1, southwest, southeast, northwest, northeast, 154_000, 0.28);
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
 * GPU-first by design: the live NOAA field becomes a compact static mesh and
 * only the atmospheric movement runs each frame. This avoids a JavaScript
 * particle loop while retaining a curved, high-altitude 3D aurora.
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
    this.vertexCount = this.mesh.length / 5;
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
    gl.uniform1f(bundle.time, performance.now() / 1_000);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(bundle.position);
    gl.vertexAttribPointer(bundle.position, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(bundle.field);
    gl.vertexAttribPointer(bundle.field, 2, gl.FLOAT, false, 20, 12);
    gl.disable(gl.DEPTH_TEST);
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
    }, document.hidden ? 1_000 : slowerDevice ? 100 : 66);
  }

  private programFor(gl: WebGL2RenderingContext, options: CustomRenderMethodInput): ProgramBundle {
    const key = options.shaderData.variantName;
    const existing = this.programs.get(key);
    if (existing) return existing;
    const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
${options.shaderData.vertexShaderPrelude}
${options.shaderData.define}
in vec3 a_position;
in vec2 a_field;
uniform float u_time;
out float v_strength;
out float v_height;
out float v_fold;
void main() {
  float heightRatio = clamp((a_position.z - ${curtainFloorMetres.toFixed(1)}) / ${(curtainCeilingMetres - curtainFloorMetres).toFixed(1)}, 0.0, 1.0);
  float broadWave = sin(a_field.y * 2.05 + u_time * 0.11) * 0.62 + sin(a_field.y * 5.2 - u_time * 0.07) * 0.22;
  float travellingFold = sin(a_field.y * 1.45 + heightRatio * 3.5 - u_time * 0.15);
  float extraHeight = broadWave * (7600.0 + a_field.x * 17600.0) * mix(0.48, 1.0, smoothstep(0.05, 0.94, heightRatio));
  // This projection performs the globe's own horizon clipping. It keeps
  // the back-side curtain out of view without forcing a depth mode that
  // can disrupt MapLibre's raster globe on some GPUs.
  gl_Position = projectTileWithElevation(a_position.xy, a_position.z + extraHeight);
  v_strength = a_field.x;
  v_height = heightRatio;
  v_fold = travellingFold;
}`);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in float v_strength;
in float v_height;
in float v_fold;
uniform float u_time;
out vec4 fragColor;
void main() {
  float lowerFade = smoothstep(0.01, 0.18, v_height);
  float upperFade = 1.0 - smoothstep(0.72, 1.0, v_height);
  float filament = 0.86 + 0.14 * sin(v_fold * 1.15 + u_time * 0.075);
  float energy = smoothstep(0.04, 0.78, v_strength);
  float alpha = (0.08 + energy * 0.70) * pow(energy, 0.62) * lowerFade * upperFade * filament;
  vec3 oxygenGreen = mix(vec3(0.03, 0.24, 0.22), vec3(0.36, 1.0, 0.56), clamp(v_strength * 1.2, 0.0, 1.0));
  vec3 nitrogenViolet = vec3(0.44, 0.26, 0.90);
  vec3 highAltitudeRed = vec3(0.95, 0.18, 0.36);
  float violetMix = smoothstep(0.82, 1.0, v_strength) * (1.0 - smoothstep(0.12, 0.38, v_height));
  float redMix = smoothstep(0.88, 1.0, v_strength) * smoothstep(0.50, 0.97, v_height);
  vec3 colour = mix(oxygenGreen, nitrogenViolet, violetMix);
  colour = mix(colour, highAltitudeRed, redMix);
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
