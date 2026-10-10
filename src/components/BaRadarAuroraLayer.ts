import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import type { RadarAuroraData, RadarAuroraSample } from "@/lib/radar-external";

type AuroraSector = {
  index: number;
  longitude: number;
  latitude: number;
  strength: number;
  phase: number;
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

// The visible northern oval normally occupies roughly 60–75°N. Keeping the
// source field inside this real-world envelope prevents low-confidence NOAA
// pixels from turning into false curtains over the continental US or Europe.
const POLAR_OVAL_FLOOR = 58;
const POLAR_OVAL_CEILING = 82.5;
const SECTOR_WIDTH_DEGREES = 12;
const CURTAIN_LANES = 1;
const CURTAIN_WIDTH_STEPS = 9;
const CURTAIN_HEIGHT_STEPS = 7;
const CURTAIN_FLOOR_METRES = 85_000;
const CURTAIN_CEILING_METRES = 320_000;
const CURTAIN_SHELL_ALTITUDES = [112_000, 165_000, 220_000];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
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

/**
 * Converts NOAA's probability cells into a deliberately small set of broad
 * curtain sections. The geometry never needs reprojecting when a pilot drags
 * the camera: MapLibre projects every vertex against the live globe itself.
 */
function createAuroraMesh(data: RadarAuroraData | null) {
  if (!data?.samples.length) return new Float32Array();

  const sectors = new Map<number, { totalWeight: number; weightedLatitude: number; peak: number }>();
  for (const sample of data.samples) {
    if (!sampleIsUsable(sample)) continue;
    const longitude = normaliseLongitude(sample.longitude);
    const index = Math.floor((longitude + 180) / SECTOR_WIDTH_DEGREES);
    const entry = sectors.get(index) ?? { totalWeight: 0, weightedLatitude: 0, peak: 0 };
    const weight = sample.probability * sample.probability;
    entry.totalWeight += weight;
    entry.weightedLatitude += sample.latitude * weight;
    entry.peak = Math.max(entry.peak, sample.probability);
    sectors.set(index, entry);
  }

  const ordered = [...sectors.entries()]
    .flatMap(([index, entry]) => {
      if (!entry.totalWeight) return [];
      // A quiet oval remains gently visible while a NOAA hot spot receives a
      // clearly brighter, wider curtain. This is intensity-led, not imagery.
      const strength = clamp((entry.peak - 2) / 15, 0.28, 1);
      return [{
        index,
        longitude: -180 + (index + 0.5) * SECTOR_WIDTH_DEGREES,
        latitude: entry.weightedLatitude / entry.totalWeight,
        strength,
        phase: index * 0.61803398875,
      } satisfies AuroraSector];
    })
    .sort((left, right) => left.index - right.index);

  const candidates: Array<{ left: AuroraSector; right: AuroraSector; score: number }> = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = ordered[index];
    const right = ordered[index + 1];
    // Do not connect across absent forecast sectors or the antimeridian. The
    // natural gaps are what let the display breathe rather than form a ruler-
    // perfect light ring.
    if (right.index - left.index !== 1 || Math.abs(left.latitude - right.latitude) > 5.5) continue;
    candidates.push({ left, right, score: Math.min(left.strength, right.strength) + Math.max(left.strength, right.strength) * 0.24 });
  }

  // Adjacent NOAA sectors deliberately share their edge vertices. This avoids
  // the visible rectangular breaks caused by rendering each forecast cell as
  // an isolated card; real gaps are still retained where the source has none.
  const selected = candidates.sort((left, right) => left.left.index - right.left.index);
  if (!selected.length) return new Float32Array();

  const vertices: number[] = [];
  const appendVertex = (longitude: number, latitude: number, elevation: number, strength: number, phase: number, lane: number, edge: number) => {
    const [x, y] = mercatorCoordinate(longitude, latitude);
    vertices.push(x, y, elevation, strength, phase, lane, edge);
  };

  for (let segmentIndex = 0; segmentIndex < selected.length; segmentIndex += 1) {
    const { left, right } = selected[segmentIndex];
    // The central curtain provides close, vertical detail. A separate set of
    // low-alpha shells below supplies its visible aerial volume.
    for (let laneIndex = 0; laneIndex < CURTAIN_LANES; laneIndex += 1) {
      const laneProgress = CURTAIN_LANES === 1 ? 0.5 : laneIndex / (CURTAIN_LANES - 1);
      const laneOffset = (laneProgress - 0.5) * 3.6;
      const lane = segmentIndex * CURTAIN_LANES + laneIndex + 1;
      for (let widthStep = 0; widthStep < CURTAIN_WIDTH_STEPS; widthStep += 1) {
      const start = widthStep / CURTAIN_WIDTH_STEPS;
      const end = (widthStep + 1) / CURTAIN_WIDTH_STEPS;
      const makePoint = (ratio: number, heightRatio: number) => {
        const longitude = left.longitude + (right.longitude - left.longitude) * ratio;
        const baseLatitude = left.latitude + (right.latitude - left.latitude) * ratio;
        // An irregular, yet fixed geographic leading edge gives the shader a
        // broad, wavy canvas to animate. It is no longer a series of cards.
        const shoreline = Math.sin((ratio * 4.6 + left.phase) * Math.PI) * 1.05
          + Math.sin((ratio * 9.3 - right.phase) * Math.PI) * 0.36;
        const laneWander = Math.sin((ratio * 5.8 + laneIndex * 0.71 + left.phase) * Math.PI) * 0.44;
        const latitude = clamp(baseLatitude + laneOffset + laneWander + shoreline * (0.45 + heightRatio * 0.36), POLAR_OVAL_FLOOR - 1.4, POLAR_OVAL_CEILING + 1.8);
        const elevation = CURTAIN_FLOOR_METRES + (CURTAIN_CEILING_METRES - CURTAIN_FLOOR_METRES) * heightRatio;
        const strength = (left.strength + (right.strength - left.strength) * ratio) * (0.82 + (1 - Math.abs(laneProgress - 0.5) * 2) * 0.18);
        const phase = left.phase + (right.phase - left.phase) * ratio + heightRatio * 0.13 + laneIndex * 0.43;
        return { longitude, latitude, elevation, strength, phase, edge: Math.sin(Math.PI * ratio) };
      };
      for (let heightStep = 0; heightStep < CURTAIN_HEIGHT_STEPS; heightStep += 1) {
        const lower = heightStep / CURTAIN_HEIGHT_STEPS;
        const upper = (heightStep + 1) / CURTAIN_HEIGHT_STEPS;
        const bottomLeft = makePoint(start, lower);
        const bottomRight = makePoint(end, lower);
        const topRight = makePoint(end, upper);
        const topLeft = makePoint(start, upper);
        appendVertex(bottomLeft.longitude, bottomLeft.latitude, bottomLeft.elevation, bottomLeft.strength, bottomLeft.phase, lane, bottomLeft.edge);
        appendVertex(bottomRight.longitude, bottomRight.latitude, bottomRight.elevation, bottomRight.strength, bottomRight.phase, lane, bottomRight.edge);
        appendVertex(topRight.longitude, topRight.latitude, topRight.elevation, topRight.strength, topRight.phase, lane, topRight.edge);
        appendVertex(bottomLeft.longitude, bottomLeft.latitude, bottomLeft.elevation, bottomLeft.strength, bottomLeft.phase, lane, bottomLeft.edge);
        appendVertex(topRight.longitude, topRight.latitude, topRight.elevation, topRight.strength, topRight.phase, lane, topRight.edge);
        appendVertex(topLeft.longitude, topLeft.latitude, topLeft.elevation, topLeft.strength, topLeft.phase, lane, topLeft.edge);
      }
      }
    }

    // Soft emission shells supply the width that is visible from above the
    // planet. They share the same NOAA sector as the vertical curtains, but
    // are suspended at three genuine altitudes to create parallax rather than
    // a flat map overlay.
    for (let shellIndex = 0; shellIndex < CURTAIN_SHELL_ALTITUDES.length; shellIndex += 1) {
      const elevation = CURTAIN_SHELL_ALTITUDES[shellIndex];
      for (let widthStep = 0; widthStep < CURTAIN_WIDTH_STEPS; widthStep += 1) {
        const start = widthStep / CURTAIN_WIDTH_STEPS;
        const end = (widthStep + 1) / CURTAIN_WIDTH_STEPS;
        const makeShellPoint = (ratio: number, cross: number) => {
          const longitude = left.longitude + (right.longitude - left.longitude) * ratio;
          const baseLatitude = left.latitude + (right.latitude - left.latitude) * ratio;
          const offset = -1.85 + cross * 3.7;
          const latitude = clamp(baseLatitude + offset + Math.sin((ratio * 5.7 + cross * 1.9 + shellIndex * 0.41) * Math.PI) * 0.33, POLAR_OVAL_FLOOR - 1.6, POLAR_OVAL_CEILING + 2.1);
          const strength = (left.strength + (right.strength - left.strength) * ratio) * (0.60 + shellIndex * 0.07);
          const phase = left.phase + (right.phase - left.phase) * ratio + cross * 0.29 + shellIndex * 0.47;
          return { longitude, latitude, strength, phase, edge: Math.sin(Math.PI * ratio) };
        };
        for (let crossStep = 0; crossStep < 3; crossStep += 1) {
          const lowerCross = crossStep / 3;
          const upperCross = (crossStep + 1) / 3;
          const bottomLeft = makeShellPoint(start, lowerCross);
          const bottomRight = makeShellPoint(end, lowerCross);
          const topRight = makeShellPoint(end, upperCross);
          const topLeft = makeShellPoint(start, upperCross);
          const shellLane = -(shellIndex + 1);
          appendVertex(bottomLeft.longitude, bottomLeft.latitude, elevation, bottomLeft.strength, bottomLeft.phase, shellLane, bottomLeft.edge);
          appendVertex(bottomRight.longitude, bottomRight.latitude, elevation, bottomRight.strength, bottomRight.phase, shellLane, bottomRight.edge);
          appendVertex(topRight.longitude, topRight.latitude, elevation, topRight.strength, topRight.phase, shellLane, topRight.edge);
          appendVertex(bottomLeft.longitude, bottomLeft.latitude, elevation, bottomLeft.strength, bottomLeft.phase, shellLane, bottomLeft.edge);
          appendVertex(topRight.longitude, topRight.latitude, elevation, topRight.strength, topRight.phase, shellLane, topRight.edge);
          appendVertex(topLeft.longitude, topLeft.latitude, elevation, topLeft.strength, topLeft.phase, shellLane, topLeft.edge);
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
 * A globe-native, data-led aurora. The altitude values are real-world metres,
 * so MapLibre's globe projection and depth buffer keep every curtain attached
 * to the northern Earth as it rotates — including close or oblique views.
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
    // During a drag the Earth already redraws at the input rate. Freezing the
    // tiny shader clock briefly avoids spending extra frame time on motion the
    // pilot cannot perceive, while keeping the curtain fully globe-attached.
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
out float v_height;
out float v_phase;
out float v_lane;
out float v_shell;
out float v_edge;
void main() {
  float heightRatio = clamp((a_position.z - ${CURTAIN_FLOOR_METRES.toFixed(1)}) / ${(CURTAIN_CEILING_METRES - CURTAIN_FLOOR_METRES).toFixed(1)}, 0.0, 1.0);
  float shell = step(a_field.z, 0.0);
  float lane = abs(a_field.z);
  float crest = sin(3.14159265 * heightRatio);
  float slowWave = sin(a_field.y * 4.7 + u_time * 0.11 + lane * 0.79) * 0.58
    + sin(a_field.y * 10.9 - u_time * 0.063 - lane * 0.37) * 0.24;
  float travellingFold = sin(a_field.y * 18.0 + heightRatio * 8.2 - u_time * 0.31 + lane * 1.71) * 0.42
    + sin(a_field.y * 31.0 - heightRatio * 14.0 + u_time * 0.16) * 0.16;
  // Latitude drift stays under about 0.8 degrees. It is enough for living,
  // intertwining curtains, but never permits a segment to wander away from
  // the northern oval selected from NOAA's forecast.
  float latitudeDrift = (slowWave * 0.68 + travellingFold * 0.32) * (0.00024 + a_field.x * 0.00078) * mix(0.25, 1.0, crest) * mix(1.0, 0.30, shell);
  float elevationWave = (slowWave * 0.72 + travellingFold * 0.28) * (4500.0 + a_field.x * 12000.0) * crest * mix(1.0, 0.28, shell);
  gl_Position = projectTileFor3D(a_position.xy + vec2(0.0, latitudeDrift), a_position.z + elevationWave);
  v_strength = a_field.x;
  v_height = heightRatio;
  v_phase = a_field.y;
  v_lane = lane;
  v_shell = shell;
  v_edge = a_field.w;
}`);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in float v_strength;
in float v_height;
in float v_phase;
in float v_lane;
in float v_shell;
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
  float amplitude = 0.55;
  for (int octave = 0; octave < 3; octave++) {
    total += noise(point) * amplitude;
    point = point * 2.04 + 7.3;
    amplitude *= 0.5;
  }
  return total;
}
void main() {
  float lowerFade = smoothstep(0.0, 0.055, v_height);
  float upperFade = 1.0 - smoothstep(0.87, 1.0, v_height);
  vec2 flow = vec2(v_phase * 2.6 - u_time * 0.047, v_height * 4.8 + u_time * 0.09 + v_lane * 0.13);
  // This produces diagonal breaks that slide through the height of each
  // curtain; no horizontal cutoff can become a visible straight line.
  float broadBody = fbm(flow * 0.72 + vec2(0.0, v_height * 1.6));
  float reconnecting = mix(0.38, 1.0, smoothstep(0.20, 0.68, broadBody + sin(v_phase * 7.8 + v_height * 8.5 - u_time * 0.16) * 0.17));
  float fineRay = pow(0.5 + 0.5 * sin(v_phase * 27.0 + v_height * 6.4 - u_time * 0.33 + v_lane), 2.25);
  float secondaryRay = pow(0.5 + 0.5 * sin(v_phase * 12.0 - v_height * 15.0 + u_time * 0.19), 3.2);
  float strands = mix(0.48, 1.0, max(fineRay, secondaryRay));
  float energy = smoothstep(0.12, 0.92, v_strength);
  float curtainAlpha = (0.07 + energy * 0.30) * lowerFade * upperFade * reconnecting * strands;
  float shellTexture = mix(0.45, 1.0, fbm(flow * 1.16 + vec2(v_height * 2.7, -u_time * 0.025)));
  float shellAlpha = (0.035 + energy * 0.13) * shellTexture * (0.68 + 0.32 * reconnecting);
  // Keep adjacent sectors visually continuous, while making a genuine source
  // gap soften into the darkness instead of ending as a straight rectangle.
  float endpointFade = mix(0.36, 1.0, smoothstep(0.05, 0.32, v_edge + sin(v_height * 8.0 - u_time * 0.13 + v_lane) * 0.05));
  float alpha = mix(curtainAlpha, shellAlpha, v_shell) * endpointFade;
  if (alpha < 0.018) discard;
  vec3 green = mix(vec3(0.03, 0.30, 0.22), vec3(0.36, 0.92, 0.58), clamp(v_strength * 1.22, 0.0, 1.0));
  vec3 violet = vec3(0.50, 0.30, 0.92);
  vec3 red = vec3(1.0, 0.22, 0.39);
  float violetMix = smoothstep(0.78, 1.0, v_strength) * (1.0 - smoothstep(0.04, 0.18, v_height));
  float redMix = smoothstep(0.86, 1.0, v_strength) * smoothstep(0.74, 0.98, v_height);
  vec3 colour = mix(green, violet, violetMix * 0.30);
  colour = mix(colour, red, redMix * 0.38);
  fragColor = vec4(mix(colour, colour * 0.72, v_shell), alpha);
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
