import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";

type ProgramBundle = {
  program: WebGLProgram;
  position: number;
  fallbackMatrix: WebGLUniformLocation | null;
  projectionMatrix: WebGLUniformLocation | null;
  tileMercatorCoordinates: WebGLUniformLocation | null;
  clippingPlane: WebGLUniformLocation | null;
  transition: WebGLUniformLocation | null;
  solarTime: WebGLUniformLocation | null;
  solarDeclination: WebGLUniformLocation | null;
};

const DAY_NIGHT_TAU = Math.PI * 2;
// This is deliberately in the lower atmosphere rather than on the terrain.
// A near-surface overlay z-fights the globe depth buffer at full-planet zoom,
// producing tiled dark patches. At 20 km the shell remains visually attached
// to Earth but has enough depth separation to render as one continuous shade.
const ATMOSPHERE_ELEVATION_METRES = 20_000;
// Globe projection curves custom geometry itself, but the horizon clips
// triangles that are too large. The former 3.75° mesh was visibly broken
// into dark shards at the limb on real devices. A two-degree mesh stays
// smooth while remaining a small, static GPU buffer.
const LONGITUDE_SEGMENTS = 180;
const LATITUDE_SEGMENTS = 90;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function mercatorCoordinate(longitude: number, latitude: number): [number, number] {
  const x = (longitude + 180) / 360;
  const latitudeRadians = clamp(latitude, -85, 85) * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2)) / Math.PI) / 2;
  return [x, y];
}

function createSurfaceMesh() {
  const vertices: number[] = [];
  const append = (longitude: number, latitude: number) => {
    const [x, y] = mercatorCoordinate(longitude, latitude);
    vertices.push(x, y, ATMOSPHERE_ELEVATION_METRES);
  };
  for (let latitudeIndex = 0; latitudeIndex < LATITUDE_SEGMENTS; latitudeIndex += 1) {
    const south = -85 + latitudeIndex * 170 / LATITUDE_SEGMENTS;
    const north = -85 + (latitudeIndex + 1) * 170 / LATITUDE_SEGMENTS;
    for (let longitudeIndex = 0; longitudeIndex < LONGITUDE_SEGMENTS; longitudeIndex += 1) {
      const west = -180 + longitudeIndex * 360 / LONGITUDE_SEGMENTS;
      const east = -180 + (longitudeIndex + 1) * 360 / LONGITUDE_SEGMENTS;
      append(west, south);
      append(east, south);
      append(east, north);
      append(west, south);
      append(east, north);
      append(west, north);
    }
  }
  return new Float32Array(vertices);
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create day/night shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown day/night shader error";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

/**
 * A light-weight solar terminator overlay. It is tessellated once in globe
 * coordinates, then shaded on the GPU from the real UTC solar position.
 * This keeps the night side attached to Earth during an orbit and avoids a
 * screen-space vignette that would move with the camera.
 */
export class BaRadarDayNightLayer implements CustomLayerInterface {
  readonly id = "ba-radar-globe-day-night";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private map: MapLibreMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private buffer: WebGLBuffer | null = null;
  private programs = new Map<string, ProgramBundle>();
  private readonly mesh = createSurfaceMesh();
  private readonly vertexCount = this.mesh.length / 3;
  private enabled = true;
  private repaintTimer: number | null = null;
  private disposed = false;

  update(enabled: boolean) {
    this.enabled = enabled;
    this.scheduleRepaint();
    this.map?.triggerRepaint();
  }

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext) {
    if (!("createVertexArray" in context)) {
      console.warn("BA-Radar's real-time day/night globe requires WebGL2.");
      return;
    }
    this.map = map;
    this.gl = context;
    this.buffer = context.createBuffer();
    if (this.buffer) {
      context.bindBuffer(context.ARRAY_BUFFER, this.buffer);
      context.bufferData(context.ARRAY_BUFFER, this.mesh, context.STATIC_DRAW);
    }
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
    if (!("createVertexArray" in context) || !this.enabled || !this.buffer) return;
    const gl = context;
    let bundle: ProgramBundle;
    try {
      bundle = this.programFor(gl, options);
    } catch (error) {
      this.enabled = false;
      console.warn("BA-Radar's day/night globe shader could not start.", error);
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
    gl.uniform1f(bundle.solarTime, now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds());
    gl.uniform1f(bundle.solarDeclination, 0.409 * Math.sin(DAY_NIGHT_TAU * (dayOfYear - 81) / 365.25));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(bundle.position);
    gl.vertexAttribPointer(bundle.position, 3, gl.FLOAT, false, 12, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    // Alpha compositing darkens only the unlit hemisphere without affecting
    // the already-emissive aurora layer rendered above this surface.
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    gl.depthMask(true);
  }

  private scheduleRepaint() {
    if (this.repaintTimer !== null) window.clearTimeout(this.repaintTimer);
    if (!this.map || this.disposed || !this.enabled) return;
    // The terminator moves slowly. Updating every 20 seconds avoids spending
    // frames on an almost-static visual while still keeping UTC lighting live.
    this.repaintTimer = window.setTimeout(() => {
      if (this.disposed) return;
      if (!document.hidden && !this.map?.isMoving()) this.map?.triggerRepaint();
      this.scheduleRepaint();
    }, document.hidden ? 60_000 : this.map.isMoving() ? 60_000 : 20_000);
  }

  private programFor(gl: WebGL2RenderingContext, options: CustomRenderMethodInput): ProgramBundle {
    const key = options.shaderData.variantName;
    const existing = this.programs.get(key);
    if (existing) return existing;
    const vertex = compileShader(gl, gl.VERTEX_SHADER, `#version 300 es
${options.shaderData.vertexShaderPrelude}
${options.shaderData.define}
in vec3 a_position;
out vec2 v_coordinate;
void main() {
  gl_Position = projectTileFor3D(a_position.xy, a_position.z);
  // Keep the geographic position for a per-fragment terminator. Computing
  // darkness only at vertices was the source of the tiled-looking bands:
  // values were interpolated across large curved globe triangles.
  v_coordinate = a_position.xy;
}`);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
in vec2 v_coordinate;
uniform float u_solarTime;
uniform float u_solarDeclination;
out vec4 fragColor;
const float SUN_PI = 3.14159265359;
const float SUN_TAU = 6.28318530718;
void main() {
  float longitude = v_coordinate.x * SUN_TAU - SUN_PI;
  float latitude = atan(sinh(SUN_PI * (1.0 - 2.0 * v_coordinate.y)));
  float solarLongitude = (0.5 - u_solarTime / 86400.0) * SUN_TAU;
  float solarElevation = sin(latitude) * sin(u_solarDeclination)
    + cos(latitude) * cos(u_solarDeclination) * cos(longitude - solarLongitude);
  // A broad twilight band keeps sunset natural without leaving a hard or
  // visibly polygonal terminator around the Earth.
  float v_night = 1.0 - smoothstep(-0.18, 0.16, solarElevation);
  // Preserve enough surface context for coastlines and the NASA city-light
  // layer to read, rather than turning the whole night hemisphere black.
  vec3 twilightTint = vec3(0.028, 0.078, 0.122);
  vec3 nightTint = vec3(0.007, 0.022, 0.050);
  float darkness = pow(v_night, 1.18);
  vec3 tint = mix(twilightTint, nightTint, smoothstep(0.28, 1.0, darkness));
  fragColor = vec4(tint, 0.54 * darkness);
}`);
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to link day/night globe shader.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) ?? "Unknown day/night shader link error";
      gl.deleteProgram(program);
      throw new Error(message);
    }
    const bundle: ProgramBundle = {
      program,
      position: gl.getAttribLocation(program, "a_position"),
      fallbackMatrix: gl.getUniformLocation(program, "u_projection_fallback_matrix"),
      projectionMatrix: gl.getUniformLocation(program, "u_projection_matrix"),
      tileMercatorCoordinates: gl.getUniformLocation(program, "u_projection_tile_mercator_coords"),
      clippingPlane: gl.getUniformLocation(program, "u_projection_clipping_plane"),
      transition: gl.getUniformLocation(program, "u_projection_transition"),
      solarTime: gl.getUniformLocation(program, "u_solarTime"),
      solarDeclination: gl.getUniformLocation(program, "u_solarDeclination"),
    };
    this.programs.set(key, bundle);
    return bundle;
  }
}
