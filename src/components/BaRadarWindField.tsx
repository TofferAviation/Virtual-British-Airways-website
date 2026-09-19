"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { RadarWindGrid } from "@/lib/radar-external";

const FIELD_COLUMNS = 112;
const FIELD_ROWS = 72;
const DESKTOP_PARTICLE_SIDE = 96;
const COMPACT_PARTICLE_SIDE = 64;

const fullScreenVertexShader = `#version 300 es
precision highp float;
out vec2 v_uv;
const vec2 positions[6] = vec2[6](
  vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
  vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0)
);
void main() {
  vec2 position = positions[gl_VertexID];
  v_uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const particleUpdateShader = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform sampler2D u_field;
uniform ivec2 u_state_size;
uniform ivec2 u_field_size;
uniform vec2 u_canvas_size;
uniform float u_delta;
uniform float u_time;
out vec4 out_state;

float hash(vec2 value) {
  return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
}

vec4 sampleField(vec2 position) {
  vec2 scaled = clamp(position, 0.0, 0.99999) * vec2(u_field_size - 1);
  ivec2 lower = ivec2(floor(scaled));
  ivec2 upper = min(lower + ivec2(1), u_field_size - 1);
  vec2 fraction = fract(scaled);
  vec4 south = mix(texelFetch(u_field, lower, 0), texelFetch(u_field, ivec2(upper.x, lower.y), 0), fraction.x);
  vec4 north = mix(texelFetch(u_field, ivec2(lower.x, upper.y), 0), texelFetch(u_field, upper, 0), fraction.x);
  return mix(south, north, fraction.y);
}

vec4 respawn(vec2 seed) {
  return vec4(hash(seed + u_time), hash(seed.yx + u_time * 1.618), 0.0, hash(seed + 42.0));
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec4 particle = texelFetch(u_state, pixel, 0);
  vec4 wind = sampleField(particle.xy);
  bool invalid = wind.a < 0.5 || wind.z < 0.05 || particle.x < 0.0 || particle.x > 1.0 || particle.y < 0.0 || particle.y > 1.0;
  particle.z += u_delta * (0.075 + particle.w * 0.075);
  if (invalid || particle.z > 1.0) {
    out_state = respawn(vec2(pixel));
    return;
  }
  float distance_pixels = clamp(wind.z * 0.17 * u_delta, 0.05, 4.0);
  particle.xy += wind.xy * distance_pixels / u_canvas_size;
  if (particle.x < 0.0 || particle.x > 1.0 || particle.y < 0.0 || particle.y > 1.0) {
    out_state = respawn(vec2(pixel) + particle.w);
    return;
  }
  out_state = particle;
}`;

const particleDrawVertexShader = `#version 300 es
precision highp float;
uniform sampler2D u_state;
uniform sampler2D u_field;
uniform ivec2 u_state_size;
uniform ivec2 u_field_size;
uniform vec2 u_canvas_size;
out vec4 v_colour;

vec4 sampleField(vec2 position) {
  vec2 scaled = clamp(position, 0.0, 0.99999) * vec2(u_field_size - 1);
  ivec2 lower = ivec2(floor(scaled));
  ivec2 upper = min(lower + ivec2(1), u_field_size - 1);
  vec2 fraction = fract(scaled);
  vec4 south = mix(texelFetch(u_field, lower, 0), texelFetch(u_field, ivec2(upper.x, lower.y), 0), fraction.x);
  vec4 north = mix(texelFetch(u_field, ivec2(lower.x, upper.y), 0), texelFetch(u_field, upper, 0), fraction.x);
  return mix(south, north, fraction.y);
}

vec3 colourForSpeed(float speed) {
  vec3 calm = vec3(0.38, 0.78, 1.0);
  vec3 fresh = vec3(0.30, 0.94, 0.67);
  vec3 strong = vec3(1.0, 0.82, 0.34);
  vec3 jet = vec3(1.0, 0.33, 0.46);
  if (speed < 12.0) return mix(calm, fresh, speed / 12.0);
  if (speed < 28.0) return mix(fresh, strong, (speed - 12.0) / 16.0);
  return mix(strong, jet, min(1.0, (speed - 28.0) / 45.0));
}

void main() {
  int particle_index = gl_VertexID / 2;
  ivec2 state_pixel = ivec2(particle_index % u_state_size.x, particle_index / u_state_size.x);
  vec4 particle = texelFetch(u_state, state_pixel, 0);
  vec4 wind = sampleField(particle.xy);
  float line_pixels = clamp(4.0 + wind.z * 0.22, 5.0, 21.0);
  float endpoint = (gl_VertexID % 2 == 0) ? -1.0 : 0.35;
  vec2 position = particle.xy + wind.xy * (line_pixels * endpoint) / u_canvas_size;
  gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
  float alpha = wind.a < 0.5 ? 0.0 : 0.84;
  v_colour = vec4(colourForSpeed(wind.z), alpha);
}`;

const particleDrawFragmentShader = `#version 300 es
precision highp float;
in vec4 v_colour;
out vec4 out_colour;
void main() { out_colour = v_colour; }`;

type Program = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

type ParticleState = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
};

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create the wind renderer shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const details = gl.getShaderInfoLog(shader) ?? "Unknown shader error.";
    gl.deleteShader(shader);
    throw new Error(details);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string, uniformNames: string[]): Program {
  const program = gl.createProgram();
  if (!program) throw new Error("Unable to create the wind renderer program.");
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const details = gl.getProgramInfoLog(program) ?? "Unknown shader link error.";
    gl.deleteProgram(program);
    throw new Error(details);
  }
  return { program, uniforms: Object.fromEntries(uniformNames.map((name) => [name, gl.getUniformLocation(program, name)])) };
}

function decodeValues(value: string, expectedLength: number) {
  const decoded = atob(value);
  if (decoded.length !== expectedLength * 2) throw new Error("The GFS wind field was incomplete.");
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  const view = new DataView(bytes.buffer);
  const values = new Float32Array(expectedLength);
  for (let index = 0; index < expectedLength; index += 1) values[index] = view.getInt16(index * 2, true);
  return values;
}

function wrapLongitude(longitude: number) {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function decodedWindGrid(grid: RadarWindGrid) {
  const cellCount = grid.width * grid.height;
  const u = decodeValues(grid.u, cellCount);
  const v = decodeValues(grid.v, cellCount);
  return { ...grid, u, v };
}

function sampleWind(grid: ReturnType<typeof decodedWindGrid>, latitude: number, longitude: number) {
  const longitudePosition = (wrapLongitude(longitude) - grid.west) / grid.stepDeg;
  const latitudePosition = (grid.north - Math.max(-90, Math.min(90, latitude))) / grid.stepDeg;
  const west = ((Math.floor(longitudePosition) % grid.width) + grid.width) % grid.width;
  const east = (west + 1) % grid.width;
  const north = Math.max(0, Math.min(grid.height - 1, Math.floor(latitudePosition)));
  const south = Math.max(0, Math.min(grid.height - 1, north + 1));
  const horizontal = longitudePosition - Math.floor(longitudePosition);
  const vertical = Math.max(0, Math.min(1, latitudePosition - Math.floor(latitudePosition)));
  const interpolate = (values: Float32Array) => {
    const northWest = values[north * grid.width + west];
    const northEast = values[north * grid.width + east];
    const southWest = values[south * grid.width + west];
    const southEast = values[south * grid.width + east];
    const northValue = northWest + (northEast - northWest) * horizontal;
    const southValue = southWest + (southEast - southWest) * horizontal;
    return (northValue + (southValue - northValue) * vertical) / grid.valueScale;
  };
  return { east: interpolate(grid.u), north: interpolate(grid.v) };
}

function buildScreenField(map: ReturnType<typeof useMap>, grid: ReturnType<typeof decodedWindGrid>) {
  const size = map.getSize();
  const values = new Float32Array(FIELD_COLUMNS * FIELD_ROWS * 4);
  for (let row = 0; row < FIELD_ROWS; row += 1) {
    for (let column = 0; column < FIELD_COLUMNS; column += 1) {
      const x = column / (FIELD_COLUMNS - 1) * size.x;
      const y = row / (FIELD_ROWS - 1) * size.y;
      const location = map.containerPointToLatLng([x, y]);
      const wind = sampleWind(grid, location.lat, location.lng);
      const speed = Math.hypot(wind.east, wind.north);
      const offsetDegrees = 0.12;
      const destination = map.latLngToContainerPoint([
        Math.max(-85, Math.min(85, location.lat + wind.north / Math.max(0.01, speed) * offsetDegrees)),
        wrapLongitude(location.lng + wind.east / Math.max(0.01, speed) * offsetDegrees / Math.max(0.15, Math.cos(location.lat * Math.PI / 180))),
      ]);
      const distance = Math.hypot(destination.x - x, destination.y - y);
      const index = (row * FIELD_COLUMNS + column) * 4;
      values[index] = distance > 0.001 ? (destination.x - x) / distance : 0;
      values[index + 1] = distance > 0.001 ? (destination.y - y) / distance : 0;
      values[index + 2] = speed;
      values[index + 3] = Number.isFinite(speed) ? 1 : 0;
    }
  }
  return { values, width: size.x, height: size.y };
}

function randomParticleState(side: number) {
  const values = new Float32Array(side * side * 4);
  for (let index = 0; index < side * side; index += 1) {
    values[index * 4] = Math.random();
    values[index * 4 + 1] = Math.random();
    values[index * 4 + 2] = Math.random();
    values[index * 4 + 3] = Math.random();
  }
  return values;
}

function createState(gl: WebGL2RenderingContext, side: number, state: Float32Array): ParticleState {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) throw new Error("Unable to initialise wind particle storage.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, side, side, 0, gl.RGBA, gl.FLOAT, state);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("This graphics driver cannot render the GPU wind field.");
  return { texture, framebuffer };
}

function createTexture(gl: WebGL2RenderingContext, width: number, height: number, values: Float32Array) {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Unable to allocate the wind field texture.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, values);
  return texture;
}

export function BaRadarWindField({ windGrid, enabled, onStatus }: { windGrid: RadarWindGrid | null; enabled: boolean; onStatus: (status: "ready" | "unsupported") => void }) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || !windGrid) return;
    let grid: ReturnType<typeof decodedWindGrid>;
    try {
      grid = decodedWindGrid(windGrid);
    } catch {
      onStatus("unsupported");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.className = "ba-radar-webgl-wind";
    canvas.setAttribute("aria-hidden", "true");
    map.getContainer().append(canvas);
    const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl || !gl.getExtension("EXT_color_buffer_float")) {
      canvas.remove();
      onStatus("unsupported");
      return;
    }

    let frame = 0;
    let previousTime = performance.now();
    let moving = false;
    let disposed = false;
    let windTexture: WebGLTexture | null = null;
    let updateProgram: Program | null = null;
    let drawProgram: Program | null = null;
    let stateA: ParticleState | null = null;
    let stateB: ParticleState | null = null;
    let vao: WebGLVertexArrayObject | null = null;
    const compact = window.matchMedia("(max-width: 760px), (prefers-reduced-motion: reduce)").matches;
    const particleSide = compact ? COMPACT_PARTICLE_SIDE : DESKTOP_PARTICLE_SIDE;

    try {
      vao = gl.createVertexArray();
      if (!vao) throw new Error("Unable to initialise the wind renderer.");
      gl.bindVertexArray(vao);
      updateProgram = createProgram(gl, fullScreenVertexShader, particleUpdateShader, ["u_state", "u_field", "u_state_size", "u_field_size", "u_canvas_size", "u_delta", "u_time"]);
      drawProgram = createProgram(gl, particleDrawVertexShader, particleDrawFragmentShader, ["u_state", "u_field", "u_state_size", "u_field_size", "u_canvas_size"]);
      const initialState = randomParticleState(particleSide);
      stateA = createState(gl, particleSide, initialState);
      stateB = createState(gl, particleSide, initialState);
      windTexture = createTexture(gl, FIELD_COLUMNS, FIELD_ROWS, new Float32Array(FIELD_COLUMNS * FIELD_ROWS * 4));

      const resetParticles = () => {
        const fresh = randomParticleState(particleSide);
        for (const state of [stateA, stateB]) {
          if (!state) continue;
          gl.bindTexture(gl.TEXTURE_2D, state.texture);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, particleSide, particleSide, gl.RGBA, gl.FLOAT, fresh);
        }
      };

      const configureView = () => {
        if (!windTexture) return;
        const field = buildScreenField(map, grid);
        const deviceRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.max(1, Math.round(field.width * deviceRatio));
        canvas.height = Math.max(1, Math.round(field.height * deviceRatio));
        canvas.style.width = `${field.width}px`;
        canvas.style.height = `${field.height}px`;
        gl.bindTexture(gl.TEXTURE_2D, windTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FIELD_COLUMNS, FIELD_ROWS, gl.RGBA, gl.FLOAT, field.values);
        resetParticles();
      };

      const bindSharedUniforms = (program: Program, stateTexture: WebGLTexture, delta = 0) => {
        if (!windTexture) return;
        gl.useProgram(program.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, stateTexture);
        gl.uniform1i(program.uniforms.u_state, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, windTexture);
        gl.uniform1i(program.uniforms.u_field, 1);
        gl.uniform2i(program.uniforms.u_state_size, particleSide, particleSide);
        gl.uniform2i(program.uniforms.u_field_size, FIELD_COLUMNS, FIELD_ROWS);
        gl.uniform2f(program.uniforms.u_canvas_size, Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight));
        if (program.uniforms.u_delta) gl.uniform1f(program.uniforms.u_delta, delta);
        if (program.uniforms.u_time) gl.uniform1f(program.uniforms.u_time, performance.now() / 1_000);
      };

      const animate = (timestamp: number) => {
        if (disposed || moving || document.hidden || !stateA || !stateB || !updateProgram || !drawProgram) return;
        frame = requestAnimationFrame(animate);
        const delta = Math.max(0.001, Math.min(0.05, (timestamp - previousTime) / 1_000));
        previousTime = timestamp;
        gl.bindFramebuffer(gl.FRAMEBUFFER, stateB.framebuffer);
        gl.viewport(0, 0, particleSide, particleSide);
        gl.disable(gl.BLEND);
        bindSharedUniforms(updateProgram, stateA.texture, delta);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        bindSharedUniforms(drawProgram, stateB.texture);
        gl.drawArrays(gl.LINES, 0, particleSide * particleSide * 2);
        [stateA, stateB] = [stateB, stateA];
      };

      const pause = () => {
        moving = true;
        cancelAnimationFrame(frame);
      };
      const resume = () => {
        cancelAnimationFrame(frame);
        moving = false;
        configureView();
        previousTime = performance.now();
        frame = requestAnimationFrame(animate);
      };
      const visibilityChange = () => {
        if (document.hidden) pause(); else resume();
      };

      configureView();
      onStatus("ready");
      map.on("movestart zoomstart", pause);
      map.on("moveend zoomend resize", resume);
      document.addEventListener("visibilitychange", visibilityChange);
      frame = requestAnimationFrame(animate);

      return () => {
        disposed = true;
        cancelAnimationFrame(frame);
        map.off("movestart zoomstart", pause);
        map.off("moveend zoomend resize", resume);
        document.removeEventListener("visibilitychange", visibilityChange);
        if (windTexture) gl.deleteTexture(windTexture);
        for (const state of [stateA, stateB]) {
          if (!state) continue;
          gl.deleteTexture(state.texture);
          gl.deleteFramebuffer(state.framebuffer);
        }
        if (updateProgram) gl.deleteProgram(updateProgram.program);
        if (drawProgram) gl.deleteProgram(drawProgram.program);
        if (vao) gl.deleteVertexArray(vao);
        canvas.remove();
      };
    } catch {
      canvas.remove();
      onStatus("unsupported");
      return;
    }
  }, [enabled, map, onStatus, windGrid]);

  return null;
}
