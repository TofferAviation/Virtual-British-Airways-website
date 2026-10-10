import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import type { RadarAuroraData, RadarAuroraSample } from "@/lib/radar-external";

export type AuroraQuality = "auto" | "high" | "balanced" | "low";

export type AuroraSettings = {
  activity: number;
  animationSpeed: number;
  brightness: number;
  quality: AuroraQuality;
};

export const DEFAULT_AURORA_SETTINGS: AuroraSettings = {
  activity: 1,
  animationSpeed: 1,
  brightness: 1,
  quality: "auto",
};

type Hemisphere = "north" | "south";

type AuroraSector = {
  hemisphere: Hemisphere;
  index: number;
  phase: number;
  longitude: number;
  latitude: number;
  strength: number;
};

type AuroraColumn = AuroraSector & { edge: number };

type QualityProfile = {
  columnsPerSector: number;
  heightSteps: number;
  sheets: number;
  repaintMs: number;
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
  brightness: WebGLUniformLocation | null;
  activity: WebGLUniformLocation | null;
  speed: WebGLUniformLocation | null;
  solarTime: WebGLUniformLocation | null;
  solarDeclination: WebGLUniformLocation | null;
};

const MIN_AURORAL_LATITUDE = 45;
const MAX_AURORAL_LATITUDE = 84;
const MAGNETIC_SECTOR_COUNT = 48;
const CURTAIN_FLOOR_METRES = 88_000;
const CURTAIN_CEILING_METRES = 500_000;
const TAU = Math.PI * 2;

// A stable dipole approximation organises the visual structure. NOAA's
// geographic OVATION cells still determine where the oval is drawn and how
// bright it is, so this never pretends to be a precise live field solution.
const MAGNETIC_POLES: Record<Hemisphere, { latitude: number; longitude: number }> = {
  north: { latitude: 80.65, longitude: -72.68 },
  south: { latitude: -80.65, longitude: 107.32 },
};

const QUALITY: Record<Exclude<AuroraQuality, "auto">, QualityProfile> = {
  high: { columnsPerSector: 10, heightSteps: 30, sheets: 3, repaintMs: 40 },
  balanced: { columnsPerSector: 7, heightSteps: 22, sheets: 2, repaintMs: 62 },
  low: { columnsPerSector: 4, heightSteps: 12, sheets: 1, repaintMs: 100 },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function interpolate(left: number, right: number, ratio: number) {
  return left + (right - left) * ratio;
}

function mercatorCoordinate(longitude: number, latitude: number): [number, number] {
  const x = (longitude + 180) / 360;
  const radians = clamp(latitude, -85, 85) * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2;
  return [x, y];
}

function normaliseLongitude(longitude: number) {
  return ((longitude + 540) % 360) - 180;
}

function shortestLongitudeDelta(left: number, right: number) {
  return normaliseLongitude(right - left);
}

function smoothstep(start: number, end: number, value: number) {
  const ratio = clamp((value - start) / (end - start), 0, 1);
  return ratio * ratio * (3 - 2 * ratio);
}

function smoothRunEdge(progress: number) {
  return smoothstep(0, 0.11, progress) * (1 - smoothstep(0.89, 1, progress));
}

function sampleHemisphere(sample: RadarAuroraSample): Hemisphere {
  return sample.latitude >= 0 ? "north" : "south";
}

function sampleIsUsable(sample: RadarAuroraSample) {
  return Number.isFinite(sample.latitude)
    && Number.isFinite(sample.longitude)
    && Number.isFinite(sample.probability)
    && Math.abs(sample.latitude) >= MIN_AURORAL_LATITUDE
    && Math.abs(sample.latitude) <= MAX_AURORAL_LATITUDE
    && sample.probability >= 5;
}

function magneticPhase(latitude: number, longitude: number, hemisphere: Hemisphere) {
  const pole = MAGNETIC_POLES[hemisphere];
  const latitudeRadians = latitude * Math.PI / 180;
  const poleLatitudeRadians = pole.latitude * Math.PI / 180;
  const deltaLongitude = (longitude - pole.longitude) * Math.PI / 180;
  const east = Math.sin(deltaLongitude) * Math.cos(latitudeRadians);
  const north = Math.cos(poleLatitudeRadians) * Math.sin(latitudeRadians)
    - Math.sin(poleLatitudeRadians) * Math.cos(latitudeRadians) * Math.cos(deltaLongitude);
  return (Math.atan2(east, north) / TAU + 1) % 1;
}

function bearingToMagneticPole(latitude: number, longitude: number, hemisphere: Hemisphere) {
  const pole = MAGNETIC_POLES[hemisphere];
  const latitudeRadians = latitude * Math.PI / 180;
  const poleLatitudeRadians = pole.latitude * Math.PI / 180;
  const deltaLongitude = (pole.longitude - longitude) * Math.PI / 180;
  return Math.atan2(
    Math.sin(deltaLongitude) * Math.cos(poleLatitudeRadians),
    Math.cos(latitudeRadians) * Math.sin(poleLatitudeRadians)
      - Math.sin(latitudeRadians) * Math.cos(poleLatitudeRadians) * Math.cos(deltaLongitude),
  );
}

function moveAlongBearing(latitude: number, longitude: number, bearing: number, distanceDegrees: number) {
  const distance = distanceDegrees * Math.PI / 180;
  const latitudeRadians = latitude * Math.PI / 180;
  const longitudeRadians = longitude * Math.PI / 180;
  const movedLatitude = Math.asin(
    Math.sin(latitudeRadians) * Math.cos(distance)
      + Math.cos(latitudeRadians) * Math.sin(distance) * Math.cos(bearing),
  );
  const movedLongitude = longitudeRadians + Math.atan2(
    Math.sin(bearing) * Math.sin(distance) * Math.cos(latitudeRadians),
    Math.cos(distance) - Math.sin(latitudeRadians) * Math.sin(movedLatitude),
  );
  return {
    latitude: movedLatitude * 180 / Math.PI,
    longitude: normaliseLongitude(movedLongitude * 180 / Math.PI),
  };
}

function resolveQuality(requested: AuroraQuality): Exclude<AuroraQuality, "auto"> {
  if (requested !== "auto") return requested;
  const device = navigator as Navigator & { deviceMemory?: number };
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = device.deviceMemory ?? 4;
  if (cores <= 4 || memory <= 4 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return "low";
  return cores >= 8 && memory >= 8 ? "high" : "balanced";
}

function buildRuns(sectors: AuroraSector[]) {
  const runs: AuroraSector[][] = [];
  for (const hemisphere of ["north", "south"] as const) {
    let run: AuroraSector[] = [];
    for (const sector of sectors.filter((entry) => entry.hemisphere === hemisphere)) {
      const previous = run[run.length - 1];
      const joinsPrevious = previous
        && sector.index - previous.index === 1
        && Math.abs(sector.latitude - previous.latitude) <= 7;
      if (!joinsPrevious && run.length >= 2) {
        runs.push(run);
        run = [];
      } else if (!joinsPrevious) {
        run = [];
      }
      run.push(sector);
    }
    if (run.length >= 2) runs.push(run);
  }
  // Do not bridge the antimeridian. The reverse side of a globe is clipped
  // naturally, and forcing a final-to-first segment causes visible seams.
  return runs;
}

function makeColumns(run: AuroraSector[], columnsPerSector: number) {
  const columns: AuroraColumn[] = [];
  const lastSectorIndex = run.length - 1;
  for (let sectorIndex = 0; sectorIndex < lastSectorIndex; sectorIndex += 1) {
    const left = run[sectorIndex];
    const right = run[sectorIndex + 1];
    const unwrappedRight = left.longitude + shortestLongitudeDelta(left.longitude, right.longitude);
    for (let subdivision = 0; subdivision < columnsPerSector; subdivision += 1) {
      const ratio = subdivision / columnsPerSector;
      columns.push({
        hemisphere: left.hemisphere,
        index: left.index,
        phase: interpolate(left.phase, right.phase, ratio),
        longitude: normaliseLongitude(interpolate(left.longitude, unwrappedRight, ratio)),
        latitude: interpolate(left.latitude, right.latitude, ratio),
        strength: interpolate(left.strength, right.strength, ratio),
        edge: smoothRunEdge((sectorIndex + ratio) / lastSectorIndex),
      });
    }
  }
  const last = run[run.length - 1];
  columns.push({ ...last, edge: smoothRunEdge(1) });
  return columns;
}

function createAuroraMesh(data: RadarAuroraData | null, profile: QualityProfile) {
  if (!data?.samples.length) return new Float32Array();

  type SectorTotal = { totalWeight: number; latitude: number; longitudeX: number; longitudeY: number; peak: number };
  const sectorTotals = new Map<string, SectorTotal>();
  for (const sample of data.samples) {
    if (!sampleIsUsable(sample)) continue;
    const hemisphere = sampleHemisphere(sample);
    const phase = magneticPhase(sample.latitude, sample.longitude, hemisphere);
    const index = Math.min(MAGNETIC_SECTOR_COUNT - 1, Math.floor(phase * MAGNETIC_SECTOR_COUNT));
    const key = `${hemisphere}:${index}`;
    const entry = sectorTotals.get(key) ?? { totalWeight: 0, latitude: 0, longitudeX: 0, longitudeY: 0, peak: 0 };
    const weight = sample.probability * sample.probability;
    const longitudeRadians = sample.longitude * Math.PI / 180;
    entry.totalWeight += weight;
    entry.latitude += sample.latitude * weight;
    entry.longitudeX += Math.cos(longitudeRadians) * weight;
    entry.longitudeY += Math.sin(longitudeRadians) * weight;
    entry.peak = Math.max(entry.peak, sample.probability);
    sectorTotals.set(key, entry);
  }

  const sectors = [...sectorTotals.entries()]
    .flatMap(([key, entry]) => {
      if (!entry.totalWeight) return [];
      const [hemisphere, rawIndex] = key.split(":") as [Hemisphere, string];
      const index = Number(rawIndex);
      return [{
        hemisphere,
        index,
        phase: (index + 0.5) / MAGNETIC_SECTOR_COUNT,
        longitude: Math.atan2(entry.longitudeY, entry.longitudeX) * 180 / Math.PI,
        latitude: entry.latitude / entry.totalWeight,
        // Quiet OVATION cells remain a soft band. Strong cells add contrast
        // and ray definition rather than inventing a permanent storm.
        strength: clamp((entry.peak - 2) / 28, 0.16, 1),
      } satisfies AuroraSector];
    })
    .sort((left, right) => left.hemisphere.localeCompare(right.hemisphere) || left.index - right.index);

  const vertices: number[] = [];
  const appendVertex = (longitude: number, latitude: number, elevation: number, strength: number, phase: number, height: number, hemisphere: Hemisphere, sheet: number, edge: number) => {
    const [x, y] = mercatorCoordinate(longitude, latitude);
    // a_field: OVATION strength, magnetic local-time phase, height through
    // the volume, then hemisphere/sheet/run-edge in one static VBO.
    const packed = (hemisphere === "north" ? 0 : 2) + sheet + edge * 0.24;
    vertices.push(x, y, elevation, strength, phase, height, packed);
  };

  for (const run of buildRuns(sectors)) {
    const columns = makeColumns(run, profile.columnsPerSector);
    for (let sheet = 0; sheet < profile.sheets; sheet += 1) {
      for (let columnIndex = 0; columnIndex < columns.length - 1; columnIndex += 1) {
        const left = columns[columnIndex];
        const right = columns[columnIndex + 1];
        const makePoint = (column: AuroraColumn, height: number) => {
          const sheetPhase = sheet * 0.91 + (column.hemisphere === "north" ? 0.14 : 1.27);
          const crest = clamp(
            0.68
              + Math.sin(column.phase * TAU * 3.7 + sheetPhase) * 0.17
              + Math.sin(column.phase * TAU * 11.4 - sheetPhase * 0.7) * 0.11
              + Math.sin(column.phase * TAU * 23.8 + sheetPhase * 1.8) * 0.04,
            0.46,
            1,
          );
          const curtainHeight = height * crest;
          const crossFold = Math.sin(column.phase * TAU * 5.3 + sheetPhase) * 0.52
            + Math.sin(column.phase * TAU * 15.7 - sheetPhase) * 0.24;
          const poleBearing = bearingToMagneticPole(column.latitude, column.longitude, column.hemisphere);
          // Broad, Earth-locked folds break the oval's geometric perfection.
          // Their scale is tens of kilometres, which is visible from orbit
          // but stays faithful to an auroral arc rather than a random halo.
          const arcFold = (
            Math.sin(column.phase * TAU * 3.1 + sheetPhase * 1.7) * 0.46
            + Math.sin(column.phase * TAU * 8.6 - sheetPhase * 0.8) * 0.24
            + Math.sin(column.phase * TAU * 17.2 + sheetPhase) * 0.10
          ) * (0.28 + column.strength * 0.70);
          // Magnetic field lines are close to vertical at auroral latitudes.
          // A restrained equatorward lean makes height legible in oblique
          // views without turning the oval into a camera-facing flat plane.
          const fieldLean = (0.12 + sheet * 0.08 + crossFold * 0.05) * Math.pow(curtainHeight, 1.3);
          const alongField = moveAlongBearing(column.latitude, column.longitude, poleBearing + Math.PI, arcFold + fieldLean);
          const ripple = moveAlongBearing(
            alongField.latitude,
            alongField.longitude,
            poleBearing + Math.PI / 2,
            crossFold * (0.03 + curtainHeight * 0.22),
          );
          return {
            longitude: ripple.longitude,
            latitude: ripple.latitude,
            elevation: CURTAIN_FLOOR_METRES + (CURTAIN_CEILING_METRES - CURTAIN_FLOOR_METRES) * curtainHeight + sheet * 6_000,
            strength: column.strength * (sheet === 0 ? 1 : sheet === 1 ? 0.58 : 0.32),
            phase: column.phase,
            height,
            edge: column.edge,
          };
        };

        for (let heightStep = 0; heightStep < profile.heightSteps; heightStep += 1) {
          const lower = heightStep / profile.heightSteps;
          const upper = (heightStep + 1) / profile.heightSteps;
          const bottomLeft = makePoint(left, lower);
          const bottomRight = makePoint(right, lower);
          const topRight = makePoint(right, upper);
          const topLeft = makePoint(left, upper);
          appendVertex(bottomLeft.longitude, bottomLeft.latitude, bottomLeft.elevation, bottomLeft.strength, bottomLeft.phase, bottomLeft.height, left.hemisphere, sheet, bottomLeft.edge);
          appendVertex(bottomRight.longitude, bottomRight.latitude, bottomRight.elevation, bottomRight.strength, bottomRight.phase, bottomRight.height, right.hemisphere, sheet, bottomRight.edge);
          appendVertex(topRight.longitude, topRight.latitude, topRight.elevation, topRight.strength, topRight.phase, topRight.height, right.hemisphere, sheet, topRight.edge);
          appendVertex(bottomLeft.longitude, bottomLeft.latitude, bottomLeft.elevation, bottomLeft.strength, bottomLeft.phase, bottomLeft.height, left.hemisphere, sheet, bottomLeft.edge);
          appendVertex(topRight.longitude, topRight.latitude, topRight.elevation, topRight.strength, topRight.phase, topRight.height, right.hemisphere, sheet, topRight.edge);
          appendVertex(topLeft.longitude, topLeft.latitude, topLeft.elevation, topLeft.strength, topLeft.phase, topLeft.height, left.hemisphere, sheet, topLeft.edge);
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
 * Globe-native aurora curtain renderer. NOAA OVATION supplies spatial
 * probability; folds, emission layering and motion are a stable procedural
 * visualisation rather than claimed live optical observation.
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
  private settings: AuroraSettings = { ...DEFAULT_AURORA_SETTINGS };
  private resolvedQuality: Exclude<AuroraQuality, "auto"> = "balanced";
  private meshKey = "";
  private repaintTimer: number | null = null;
  private disposed = false;

  update(data: RadarAuroraData | null, enabled: boolean, settings: AuroraSettings = DEFAULT_AURORA_SETTINGS) {
    this.enabled = enabled;
    this.settings = settings;
    this.resolvedQuality = resolveQuality(settings.quality);
    const meshKey = `${data?.refreshedAt ?? data?.forecastAt ?? "empty"}:${data?.samples.length ?? 0}:${this.resolvedQuality}`;
    if (meshKey !== this.meshKey) {
      this.meshKey = meshKey;
      this.mesh = createAuroraMesh(data, QUALITY[this.resolvedQuality]);
      this.vertexCount = this.mesh.length / 7;
      this.uploadMesh();
    }
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
    // Wall-clock time keeps a repeatable seed and continuous motion even when
    // MapLibre redraws unevenly while the pilot moves the globe.
    const now = new Date();
    // Keep shader numbers small enough for mobile float precision. Feeding
    // Unix epoch seconds into sin/fract makes movement quantise on some GPUs.
    const motionSeconds = (now.getTime() / 1_000) % 1_000_000;
    const smoothMotion = this.map?.isMoving() ? Math.floor(motionSeconds * 10) / 10 : motionSeconds;
    const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 0);
    const dayOfYear = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - startOfYear) / 86_400_000;
    gl.uniform1f(bundle.time, smoothMotion);
    gl.uniform1f(bundle.brightness, clamp(this.settings.brightness, 0.45, 1.65));
    gl.uniform1f(bundle.activity, clamp(this.settings.activity, 0.55, 1.55));
    gl.uniform1f(bundle.speed, clamp(this.settings.animationSpeed, 0, 1.8));
    gl.uniform1f(bundle.solarTime, now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds());
    gl.uniform1f(bundle.solarDeclination, 0.409 * Math.sin(TAU * (dayOfYear - 81) / 365.25));
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
    // Add only emitted light and preserve MapLibre's opaque framebuffer alpha.
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
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
    const profile = QUALITY[this.resolvedQuality];
    this.repaintTimer = window.setTimeout(() => {
      if (this.disposed) return;
      // During an orbit MapLibre already draws for pointer input. The shader
      // time still advances at a bounded 10 fps on those frames, without a
      // second timer-driven render competing with camera interaction.
      if (!document.hidden && !this.map?.isMoving()) this.map?.triggerRepaint();
      this.scheduleRepaint();
    }, document.hidden ? 1_000 : this.map.isMoving() ? Math.max(120, profile.repaintMs * 2) : profile.repaintMs);
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
uniform float u_speed;
uniform float u_solarTime;
uniform float u_solarDeclination;
out float v_strength;
out float v_phase;
out float v_height;
out float v_sheet;
out float v_edge;
out float v_night;
const float AURORA_PI = 3.14159265359;
const float AURORA_TAU = 6.28318530718;
void main() {
  float packed = floor(a_field.w + 0.001);
  float hemisphere = floor(packed / 2.0);
  float sheet = packed - hemisphere * 2.0;
  float edge = fract(a_field.w) * 4.1666667;
  float motion = u_time * u_speed;
  // The same magnetic phase drives every height of a ray. A small correlated
  // high-altitude bend reads as a curtain, not a camera-facing texture/net.
  float broad = sin(a_field.y * AURORA_TAU * 3.2 - motion * 0.048 + sheet * 1.7 + hemisphere * 0.63);
  float fold = sin(a_field.y * AURORA_TAU * 12.1 + a_field.z * 1.4 - motion * 0.16 + sheet * 2.1);
  float ray = sin(a_field.y * AURORA_TAU * 38.0 + a_field.z * 0.32 - motion * 0.28 + hemisphere * 1.2);
  float heightEnvelope = smoothstep(0.04, 0.28, a_field.z) * (1.0 - smoothstep(0.78, 1.0, a_field.z));
  float latitudeDrift = (broad * 0.50 + fold * 0.34 + ray * 0.16)
    * (0.00016 + a_field.x * 0.00072) * heightEnvelope;
  float longitudeDrift = (broad * 0.27 - fold * 0.52 + ray * 0.09)
    * (0.00008 + a_field.x * 0.00038) * heightEnvelope;
  float altitudePulse = (broad * 0.45 + fold * 0.33 + ray * 0.22)
    * (10000.0 + a_field.x * 36000.0) * heightEnvelope;
  gl_Position = projectTileFor3D(a_position.xy + vec2(longitudeDrift, latitudeDrift), a_position.z + altitudePulse);
  float longitude = a_position.x * AURORA_TAU - AURORA_PI;
  float latitude = atan(sinh(AURORA_PI * (1.0 - 2.0 * a_position.y)));
  float solarLongitude = (0.5 - u_solarTime / 86400.0) * AURORA_TAU;
  float solarElevation = sin(latitude) * sin(u_solarDeclination)
    + cos(latitude) * cos(u_solarDeclination) * cos(longitude - solarLongitude);
  // A broad civil-twilight ramp avoids a hard day/night terminator.
  v_night = 1.0 - smoothstep(-0.12, 0.16, solarElevation);
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
in float v_night;
uniform float u_time;
uniform float u_brightness;
uniform float u_activity;
uniform float u_speed;
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
  float amplitude = 0.60;
  for (int octave = 0; octave < 3; octave++) {
    total += noise(point) * amplitude;
    point = point * 2.03 + 5.71;
    amplitude *= 0.5;
  }
  return total;
}
float bell(float value, float centre, float width) {
  float normalised = (value - centre) / width;
  return exp(-0.5 * normalised * normalised);
}
void main() {
  float motion = u_time * u_speed;
  float energy = smoothstep(0.07, 0.88, v_strength * u_activity);
  float edge = smoothstep(0.01, 0.70, v_edge);
  float baseFade = smoothstep(0.0, 0.035, v_height);
  float capFade = 1.0 - smoothstep(0.93, 1.0, v_height);
  // Coherent arcs drift slowly around the oval; thinner rays ride within
  // them. Time moves a shared wave field, never independent random pixels.
  float slowField = fbm(vec2(v_phase * 3.1 - motion * 0.008, motion * 0.012 + v_sheet * 0.21));
  float arcWave = 0.5 + 0.5 * sin(v_phase * 22.0 - motion * 0.11 + slowField * 3.8);
  float rayWave = 0.5 + 0.5 * sin(v_phase * 128.0 + v_height * 0.58 - motion * 0.42 + slowField * 5.2);
  float fineRay = 0.5 + 0.5 * sin(v_phase * 246.0 - v_height * 0.21 + motion * 0.24);
  float rays = mix(0.38 + 0.62 * rayWave, 0.55 + 0.45 * fineRay, 0.32);
  float regionalPulse = 0.75 + 0.25 * sin(v_phase * 9.0 - motion * 0.065 + slowField * 4.0);
  float fragmentingArc = smoothstep(0.30, 0.70, fbm(vec2(v_phase * 7.5 + slowField, motion * 0.018 + v_sheet * 0.47)));
  float structure = mix(0.24, 1.0, arcWave) * mix(0.28, 1.0, rays) * regionalPulse;
  // Structured transparent gaps let the oval break and reconnect without
  // exposing straight rectangular ends in the underlying geometry.
  structure *= mix(0.14, 1.0, fragmentingArc);
  // The strong 557.7nm green core lives low in the sheet. Its faint upper
  // tail keeps individual rays legible from an oblique, space-like camera
  // angle without turning the oval into a solid atmospheric torus.
  float greenProfile = bell(v_height, 0.16, 0.15) + 0.32 * bell(v_height, 0.34, 0.20);
  float redProfile = bell(v_height, 0.69, 0.24);
  float nitrogenProfile = bell(v_height, 0.045, 0.065);
  float rayTail = bell(v_height, 0.46, 0.22) * (0.10 + 0.34 * energy) * (0.18 + 0.82 * rays);
  float green = (greenProfile * (0.24 + 0.76 * structure) + rayTail) * (0.34 + 0.66 * energy);
  // High oxygen red is broader, smoother and slower than the lower curtain.
  float red = redProfile * (0.05 + 0.40 * energy * energy) * (0.52 + 0.48 * slowField);
  float nitrogen = nitrogenProfile * (0.10 + 0.50 * energy) * (0.52 + 0.48 * rays);
  float pink = nitrogenProfile * greenProfile * (0.10 + 0.38 * energy);
  vec3 oxygenGreen = vec3(0.055, 0.83, 0.39);
  vec3 oxygenRed = vec3(0.88, 0.12, 0.16);
  vec3 nitrogenBlue = vec3(0.20, 0.22, 0.94);
  vec3 nitrogenPink = vec3(0.90, 0.18, 0.58);
  vec3 colour = oxygenGreen * green + oxygenRed * red + nitrogenBlue * nitrogen * 0.44 + nitrogenPink * pink;
  float alpha = (green * 0.70 + red * 0.48 + nitrogen * 0.34 + pink * 0.30)
    * edge * baseFade * capFade * mix(0.055, 1.0, v_night) * u_brightness;
  // Tone down daylight and secondary veils before additive blending.
  colour *= mix(0.15, 1.0, v_night) * (v_sheet < 0.5 ? 1.0 : 0.62) * u_brightness;
  fragColor = vec4(colour, clamp(alpha, 0.0, 0.82));
}`);
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to link aurora shader.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) ?? "Unknown shader link error";
      gl.deleteProgram(program);
      throw new Error(message);
    }
    const bundle: ProgramBundle = {
      program,
      position: gl.getAttribLocation(program, "a_position"),
      field: gl.getAttribLocation(program, "a_field"),
      // These are supplied by MapLibre's projection prelude. Keep the
      // engine's underscore names verbatim: a valid shader with unset
      // projection uniforms renders nothing, especially in globe mode.
      fallbackMatrix: gl.getUniformLocation(program, "u_projection_fallback_matrix"),
      projectionMatrix: gl.getUniformLocation(program, "u_projection_matrix"),
      tileMercatorCoordinates: gl.getUniformLocation(program, "u_projection_tile_mercator_coords"),
      clippingPlane: gl.getUniformLocation(program, "u_projection_clipping_plane"),
      transition: gl.getUniformLocation(program, "u_projection_transition"),
      time: gl.getUniformLocation(program, "u_time"),
      brightness: gl.getUniformLocation(program, "u_brightness"),
      activity: gl.getUniformLocation(program, "u_activity"),
      speed: gl.getUniformLocation(program, "u_speed"),
      solarTime: gl.getUniformLocation(program, "u_solarTime"),
      solarDeclination: gl.getUniformLocation(program, "u_solarDeclination"),
    };
    this.programs.set(key, bundle);
    return bundle;
  }
}
