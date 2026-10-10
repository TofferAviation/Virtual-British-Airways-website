import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import type { RadarAuroraData, RadarAuroraSample } from "@/lib/radar-external";

type AuroraSector = {
  index: number;
  longitude: number;
  latitude: number;
  strength: number;
};

type AuroraColumn = {
  longitude: number;
  latitude: number;
  strength: number;
  phase: number;
  edge: number;
};

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

// The auroral oval is kept within the genuine high-latitude NOAA forecast
// envelope. The renderer then turns that field into a visual interpretation —
// it never uses a painted image as a geographic overlay.
const POLAR_OVAL_FLOOR = 58;
const POLAR_OVAL_CEILING = 82.5;
const SECTOR_WIDTH_DEGREES = 12;
const CURTAIN_COLUMN_SUBDIVISIONS = 4;
const CURTAIN_HEIGHT_STEPS = 12;
const CURTAIN_FLOOR_METRES = 88_000;
const CURTAIN_CEILING_METRES = 330_000;
const CURTAIN_SHEETS = 2;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function interpolate(left: number, right: number, ratio: number) {
  return left + (right - left) * ratio;
}

function mercatorCoordinate(longitude: number, latitude: number): [number, number] {
  const x = (longitude + 180) / 360;
  const clippedLatitude = clamp(latitude, -85, 85);
  const radians = clippedLatitude * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2;
  return [x, y];
}

function normaliseLongitude(longitude: number) {
  return ((longitude + 540) % 360) - 180;
}

function sampleIsUsable(sample: RadarAuroraSample) {
  return Number.isFinite(sample.latitude)
    && Number.isFinite(sample.longitude)
    && Number.isFinite(sample.probability)
    && sample.latitude >= POLAR_OVAL_FLOOR
    && sample.latitude <= POLAR_OVAL_CEILING
    && sample.probability >= 5;
}

function smoothstep(start: number, end: number, value: number) {
  const ratio = clamp((value - start) / (end - start), 0, 1);
  return ratio * ratio * (3 - 2 * ratio);
}

function smoothRunEdge(progress: number) {
  return smoothstep(0, 0.12, progress) * (1 - smoothstep(0.88, 1, progress));
}

function buildRuns(sectors: AuroraSector[]) {
  const runs: AuroraSector[][] = [];
  let run: AuroraSector[] = [];

  for (const sector of sectors) {
    const previous = run.at(-1);
    // Forecast gaps remain genuine gaps. Adjacent forecast cells are instead
    // blended into one single continuous strip, eliminating the card-like
    // joins that were visible in the earlier treatment.
    const joinsPrevious = previous
      && sector.index - previous.index === 1
      && Math.abs(sector.latitude - previous.latitude) <= 5.5;
    if (!joinsPrevious && run.length >= 2) {
      runs.push(run);
      run = [];
    } else if (!joinsPrevious) {
      run = [];
    }
    run.push(sector);
  }
  if (run.length >= 2) runs.push(run);

  // Do not join the first and last run across the antimeridian. MapLibre's
  // globe handles that reverse-side continuity without a dateline seam here.
  return runs;
}

function makeColumns(run: AuroraSector[]) {
  const columns: AuroraColumn[] = [];
  const lastSectorIndex = run.length - 1;
  for (let sectorIndex = 0; sectorIndex < lastSectorIndex; sectorIndex += 1) {
    const left = run[sectorIndex];
    const right = run[sectorIndex + 1];
    for (let subdivision = 0; subdivision < CURTAIN_COLUMN_SUBDIVISIONS; subdivision += 1) {
      const ratio = subdivision / CURTAIN_COLUMN_SUBDIVISIONS;
      const longitude = interpolate(left.longitude, right.longitude, ratio);
      columns.push({
        longitude,
        latitude: interpolate(left.latitude, right.latitude, ratio),
        strength: interpolate(left.strength, right.strength, ratio),
        phase: (longitude + 180) / 360,
        edge: smoothRunEdge((sectorIndex + ratio) / lastSectorIndex),
      });
    }
  }
  const last = run.at(-1)!;
  columns.push({
    longitude: last.longitude,
    latitude: last.latitude,
    strength: last.strength,
    phase: (last.longitude + 180) / 360,
    edge: smoothRunEdge(1),
  });
  return columns;
}

/**
 * Builds a pair of high-resolution, continuous curtain sheets from the NOAA
 * field. The sheets are a fraction of a degree apart and use interpolated
 * vertices across each forecast run, rather than independent sector cards.
 */
function createAuroraMesh(data: RadarAuroraData | null) {
  if (!data?.samples.length) return new Float32Array();

  const sectorTotals = new Map<number, { totalWeight: number; weightedLatitude: number; peak: number }>();
  for (const sample of data.samples) {
    if (!sampleIsUsable(sample)) continue;
    const longitude = normaliseLongitude(sample.longitude);
    const index = Math.floor((longitude + 180) / SECTOR_WIDTH_DEGREES);
    const entry = sectorTotals.get(index) ?? { totalWeight: 0, weightedLatitude: 0, peak: 0 };
    const weight = sample.probability * sample.probability;
    entry.totalWeight += weight;
    entry.weightedLatitude += sample.latitude * weight;
    entry.peak = Math.max(entry.peak, sample.probability);
    sectorTotals.set(index, entry);
  }

  const sectors = [...sectorTotals.entries()]
    .flatMap(([index, entry]) => {
      if (!entry.totalWeight) return [];
      return [{
        index,
        longitude: -180 + (index + 0.5) * SECTOR_WIDTH_DEGREES,
        latitude: entry.weightedLatitude / entry.totalWeight,
        strength: clamp((entry.peak - 2) / 15, 0.28, 1),
      } satisfies AuroraSector];
    })
    .sort((left, right) => left.index - right.index);

  const vertices: number[] = [];
  const appendVertex = (longitude: number, latitude: number, elevation: number, strength: number, phase: number, height: number, sheet: number, edge: number) => {
    const [x, y] = mercatorCoordinate(longitude, latitude);
    // a_field holds strength, fixed world phase, vertical position, then
    // sheet + run-edge. This keeps the effect in a single static VBO.
    vertices.push(x, y, elevation, strength, phase, height, sheet + edge * 0.24);
  };

  for (const run of buildRuns(sectors)) {
    const columns = makeColumns(run);
    for (let sheet = 0; sheet < CURTAIN_SHEETS; sheet += 1) {
      const sheetOffset = sheet === 0 ? -0.22 : 0.56;
      const sheetAltitude = sheet === 0 ? 0 : 7_000;
      for (let columnIndex = 0; columnIndex < columns.length - 1; columnIndex += 1) {
        const left = columns[columnIndex];
        const right = columns[columnIndex + 1];
        const makePoint = (column: AuroraColumn, height: number) => {
          // Geographic waves run across the entire strip, instead of restarting
          // at every NOAA sector edge.
          const coast = Math.sin(column.phase * Math.PI * 15 + sheet * 1.73) * 0.92
            + Math.sin(column.phase * Math.PI * 31 - sheet * 0.81) * 0.38;
          const latitude = clamp(
            column.latitude + sheetOffset + coast * (0.42 + height * 0.82),
            POLAR_OVAL_FLOOR - 1.2,
            POLAR_OVAL_CEILING + 1.5,
          );
          return {
            longitude: column.longitude,
            latitude,
            elevation: CURTAIN_FLOOR_METRES + (CURTAIN_CEILING_METRES - CURTAIN_FLOOR_METRES) * height + sheetAltitude,
            strength: column.strength * (sheet === 0 ? 1 : 0.72),
            phase: column.phase,
            height,
            edge: column.edge,
          };
        };

        for (let heightStep = 0; heightStep < CURTAIN_HEIGHT_STEPS; heightStep += 1) {
          const lower = heightStep / CURTAIN_HEIGHT_STEPS;
          const upper = (heightStep + 1) / CURTAIN_HEIGHT_STEPS;
          const bottomLeft = makePoint(left, lower);
          const bottomRight = makePoint(right, lower);
          const topRight = makePoint(right, upper);
          const topLeft = makePoint(left, upper);
          appendVertex(bottomLeft.longitude, bottomLeft.latitude, bottomLeft.elevation, bottomLeft.strength, bottomLeft.phase, bottomLeft.height, sheet, bottomLeft.edge);
          appendVertex(bottomRight.longitude, bottomRight.latitude, bottomRight.elevation, bottomRight.strength, bottomRight.phase, bottomRight.height, sheet, bottomRight.edge);
          appendVertex(topRight.longitude, topRight.latitude, topRight.elevation, topRight.strength, topRight.phase, topRight.height, sheet, topRight.edge);
          appendVertex(bottomLeft.longitude, bottomLeft.latitude, bottomLeft.elevation, bottomLeft.strength, bottomLeft.phase, bottomLeft.height, sheet, bottomLeft.edge);
          appendVertex(topRight.longitude, topRight.latitude, topRight.elevation, topRight.strength, topRight.phase, topRight.height, sheet, topRight.edge);
          appendVertex(topLeft.longitude, topLeft.latitude, topLeft.elevation, topLeft.strength, topLeft.phase, topLeft.height, sheet, topLeft.edge);
        }
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
 * A globe-native, data-led aurora. Genuine altitude values let MapLibre's
 * globe projection and depth buffer hold each flowing sheet to the northern
 * Earth at every camera angle, including close and oblique views.
 */
export class BaRadarAuroraLayer implements CustomLayerInterface {
  readonly id = "ba-radar-globe-aurora-volume";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private buffer: WebGLBuffer | null = null;
  private programs = new Map<string, ProgramBundle>();
  private mesh = new Float32Array();
  private vertexCount = 0;
  private enabled = false;
  private repaintTimer: number | null = null;
  private disposed = false;

  update(data: RadarAuroraData | null, enabled: boolean) {
    this.enabled = enabled;
    this.mesh = createAuroraMesh(data);
    this.vertexCount = this.mesh.length / 7;
    this.uploadMesh();
    this.scheduleRepaint();
    this.map?.triggerRepaint();
  }

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext) {
    if (!("createVertexArray" in context)) {
      console.warn("BA-Radar aurora requires WebGL2; the stable globe remains available.");
      return;
    }
    this.map = map;
    this.gl = context;
    this.buffer = context.createBuffer();
    this.uploadMesh();
    this.scheduleRepaint();
  }

  onRemove() {
    this.disposed = true;
    if (this.repaintTimer !== null) window.clearTimeout(this.repaintTimer);
    if (this.gl && this.buffer) this.gl.deleteBuffer(this.buffer);
    for (const program of this.programs.values()) this.gl?.deleteProgram(program.program);
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
    // While the pilot is dragging, MapLibre already draws at the input rate.
    // Holding the animation clock briefly avoids competing repaint work.
    gl.uniform1f(bundle.time, this.map?.isMoving() ? Math.floor(seconds * 4) / 4 : seconds);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(bundle.position);
    gl.vertexAttribPointer(bundle.position, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(bundle.field);
    gl.vertexAttribPointer(bundle.field, 4, gl.FLOAT, false, 28, 12);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.depthMask(true);
  }

  private uploadMesh() {
    if (!this.gl || !this.buffer) return;
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.mesh, this.gl.STATIC_DRAW);
  }

  private scheduleRepaint() {
    if (this.repaintTimer !== null) window.clearTimeout(this.repaintTimer);
    if (!this.map || this.disposed || !this.enabled || !this.vertexCount) return;
    const device = navigator as Navigator & { deviceMemory?: number };
    const lowPower = (navigator.hardwareConcurrency ?? 4) <= 4 || (device.deviceMemory ?? 4) <= 4;
    this.repaintTimer = window.setTimeout(() => {
      if (this.disposed) return;
      if (!document.hidden && !this.map?.isMoving()) this.map?.triggerRepaint();
      this.scheduleRepaint();
    }, document.hidden ? 1_000 : this.map.isMoving() ? 240 : lowPower ? 100 : 67);
  }

  private programFor(gl: WebGL2RenderingContext, options: CustomRenderMethodInput): ProgramBundle {
    const key = options.shaderData.variantName;
    const existing = this.programs.get(key);
    if (existing) return existing;
    const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
${options.shaderData.vertexShaderPrelude}
${options.shaderData.define}
in vec3 a_position;
in vec4 a_field;
uniform float u_time;
out float v_strength;
out float v_phase;
out float v_height;
out float v_sheet;
out float v_edge;
void main() {
  float sheet = floor(a_field.w + 0.001);
  float edge = fract(a_field.w) * 4.1666667;
  float largeWave = sin(a_field.y * 48.0 + u_time * 0.10 + sheet * 1.9) * 0.68
    + sin(a_field.y * 91.0 - u_time * 0.055 + sheet * 0.6) * 0.32;
  float foldingWave = sin(a_field.y * 166.0 + a_field.z * 8.6 - u_time * 0.27 + sheet * 2.7) * 0.72
    + sin(a_field.y * 278.0 - a_field.z * 14.0 + u_time * 0.14) * 0.28;
  float body = sin(3.14159265 * a_field.z);
  // Tiny motion lets the sheets breathe, while keeping them within the
  // northern oval selected from NOAA's live forecast field.
  float latitudeDrift = (largeWave * 0.62 + foldingWave * 0.38) * (0.00005 + a_field.x * 0.00018) * mix(0.22, 1.0, body);
  float elevationPulse = (largeWave * 0.58 + foldingWave * 0.42) * (2100.0 + a_field.x * 6400.0) * body;
  gl_Position = projectTileFor3D(a_position.xy + vec2(0.0, latitudeDrift), a_position.z + elevationPulse);
  v_strength = a_field.x;
  v_phase = a_field.y;
  v_height = a_field.z;
  v_sheet = sheet;
  v_edge = edge;
}`);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in float v_strength;
in float v_phase;
in float v_height;
in float v_sheet;
in float v_edge;
uniform float u_time;
out vec4 fragColor;
float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 fraction = fract(point);
  fraction = fraction * fraction * (3.0 - 2.0 * fraction);
  return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), fraction.x), mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), fraction.x), fraction.y);
}
float fbm(vec2 point) {
  float total = 0.0;
  float amplitude = 0.57;
  for (int octave = 0; octave < 3; octave++) {
    total += noise(point) * amplitude;
    point = point * 2.03 + 5.7;
    amplitude *= 0.5;
  }
  return total;
}
void main() {
  // NOAA's quiet-night probability still needs enough presence to read as a
  // soft atmospheric glow from orbit. Stronger reports add detail, rather than
  // deciding whether the entire oval is visible at all.
  float energy = smoothstep(0.0, 0.85, v_strength);
  float lowerFade = smoothstep(0.0, 0.07, v_height);
  float upperFade = 1.0 - smoothstep(0.91, 1.0, v_height);
  float edgeFade = smoothstep(0.02, 0.74, v_edge);
  vec2 slowFlow = vec2(v_phase * 11.0 - u_time * 0.035, v_height * 3.1 + u_time * 0.052 + v_sheet * 0.37);
  float cloud = fbm(slowFlow);
  float broadFold = 0.5 + 0.5 * sin(v_phase * 105.0 + cloud * 6.2 - u_time * 0.19 + v_height * 5.6);
  float innerFold = 0.5 + 0.5 * sin(v_phase * 242.0 - cloud * 8.0 + u_time * 0.31 - v_height * 11.0);
  float upwardRay = pow(max(broadFold, innerFold), 1.75);
  float veil = mix(0.62, 1.0, cloud) * mix(0.65, 1.0, upwardRay);
  // A drifting disruption prevents a perfect circular ribbon without cutting
  // the field into square forecast cells.
  float breathing = 0.72 + 0.28 * sin(v_phase * 67.0 + cloud * 4.7 + u_time * 0.12);
  float sheetWeight = mix(1.0, 0.52, v_sheet);
  float alpha = (0.20 + energy * 0.34) * veil * breathing * lowerFade * upperFade * edgeFade * sheetWeight;
  if (alpha < 0.003) discard;
  vec3 green = mix(vec3(0.025, 0.33, 0.20), vec3(0.33, 1.0, 0.54), clamp(energy * 1.18, 0.0, 1.0));
  vec3 violet = vec3(0.56, 0.28, 0.94);
  vec3 crimson = vec3(0.98, 0.18, 0.34);
  // Nitrogen marks the low energetic fringe; high-altitude oxygen adds a
  // restrained crimson/magenta cap during strong activity.
  float violetMix = smoothstep(0.79, 1.0, energy) * (1.0 - smoothstep(0.08, 0.29, v_height));
  float crimsonMix = smoothstep(0.84, 1.0, energy) * smoothstep(0.60, 0.96, v_height) * (0.46 + 0.54 * cloud);
  vec3 colour = mix(green, violet, violetMix * 0.36);
  colour = mix(colour, crimson, crimsonMix * 0.50);
  // The rear sheet supplies depth rather than a second visible wall.
  colour = mix(colour * 0.82, colour, 1.0 - v_sheet * 0.24);
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
