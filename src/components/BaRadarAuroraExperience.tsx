"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { RadarAuroraData, RadarAuroraSample } from "@/lib/radar-external";

type ProjectedPoint = { x: number; y: number };

type GlobeMap = {
  getContainer: () => HTMLElement;
  getZoom: () => number;
  project: (point: [number, number]) => ProjectedPoint;
  on: (event: "move" | "zoom" | "rotate" | "resize", listener: () => void) => void;
  off: (event: "move" | "zoom" | "rotate" | "resize", listener: () => void) => void;
};

type AuroraAnchor = RadarAuroraSample & { x: number; y: number };

const MAX_CURTAINS = 32;
const WORLD_CAMERA_Z = 900;
const WORLD_HEIGHT = 620;

const curtainVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uActivity;

  attribute vec3 aOffset;
  attribute vec2 aSize;
  attribute float aSeed;
  attribute float aStrength;
  attribute float aLayer;

  varying float vHeight;
  varying float vAcross;
  varying float vStrength;
  varying float vSeed;

  float hash(float value) {
    return fract(sin(value * 127.1) * 43758.5453123);
  }

  void main() {
    vec3 point = position;
    float height = point.y + 0.5;
    float across = point.x + 0.5;
    float time = uTime * (0.30 + aStrength * 0.12);
    float broadWave = sin((across * 4.1) + time + aSeed * 6.283) * 0.23;
    float foldingWave = sin((across * 12.0) - time * 1.7 + height * 3.4 + aSeed * 11.0) * (0.045 + height * 0.12);
    float hangingFold = sin(height * 7.0 + aSeed * 13.0 + time * 1.25) * sin(across * 5.0 - time * 0.9) * 0.085;
    float tip = smoothstep(0.16, 0.95, height);

    point.x += broadWave + foldingWave + hangingFold;
    point.z += (sin(across * 13.0 + height * 4.0 + time * 1.8 + aSeed * 20.0) * 0.14 + broadWave * 0.55) * aSize.x;
    point.y += sin(across * 9.0 - time * 1.1 + aSeed * 7.0) * tip * 0.045;

    vec3 world = aOffset + vec3(point.x * aSize.x, point.y * aSize.y, point.z) * (0.76 + aStrength * 0.32);
    vHeight = height;
    vAcross = across;
    vStrength = aStrength * uActivity;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

const curtainFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uActivity;

  varying float vHeight;
  varying float vAcross;
  varying float vStrength;
  varying float vSeed;

  float hash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 point) {
    vec2 whole = floor(point);
    vec2 part = fract(point);
    part = part * part * (3.0 - 2.0 * part);
    return mix(
      mix(hash(whole), hash(whole + vec2(1.0, 0.0)), part.x),
      mix(hash(whole + vec2(0.0, 1.0)), hash(whole + vec2(1.0, 1.0)), part.x),
      part.y
    );
  }

  float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int octave = 0; octave < 3; octave++) {
      value += noise(point) * amplitude;
      point = point * 2.04 + 12.7;
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    float flow = uTime * (0.12 + vStrength * 0.045);
    float folds = fbm(vec2(vAcross * 5.3 + vSeed * 12.0, vHeight * 5.0 - flow));
    float broadStrands = sin(vAcross * 6.5 + folds * 6.0 - flow * 1.1 + vSeed * 13.0) * 0.5 + 0.5;
    float fineRays = sin(vAcross * 29.0 + folds * 12.0 - flow * 3.5 + vSeed * 37.0) * 0.5 + 0.5;
    float strands = smoothstep(0.20, 0.90, fineRays + folds * 0.46 - 0.17) * (0.64 + broadStrands * 0.46);

    float noisyLeft = 0.07 + (folds - 0.5) * 0.14;
    float noisyRight = 0.93 + (folds - 0.5) * 0.14;
    float edge = smoothstep(noisyLeft, noisyLeft + 0.16, vAcross) * (1.0 - smoothstep(noisyRight - 0.16, noisyRight, vAcross));
    float lowerEdge = smoothstep(0.015, 0.17 + folds * 0.10, vHeight);
    float upperMist = 1.0 - smoothstep(0.58, 1.0, vHeight);
    float veil = smoothstep(0.10, 0.91, folds + 0.18) * (0.48 + strands * 0.70);
    float pulse = 0.78 + 0.22 * sin(flow * 2.4 + vSeed * 19.0 + vAcross * 5.0);

    float alpha = edge * lowerEdge * (upperMist * 0.82 + 0.18) * veil * pulse * (0.34 + vStrength * 0.98) * uActivity;
    alpha *= 1.12 + strands * 0.62;

    vec3 green = vec3(0.07, 1.0, 0.42);
    vec3 teal = vec3(0.04, 0.55, 0.78);
    vec3 violet = vec3(0.55, 0.13, 0.82);
    vec3 red = vec3(1.0, 0.16, 0.27);
    float chroma = smoothstep(0.52, 0.97, folds) * vStrength;
    vec3 colour = mix(teal, green, 0.48 + strands * 0.40);
    colour = mix(colour, violet, chroma * smoothstep(0.42, 0.88, vHeight));
    colour = mix(colour, red, chroma * smoothstep(0.80, 1.0, vHeight) * 0.34);
    colour *= 0.72 + strands * 0.70 + vStrength * 0.34;

    gl_FragColor = vec4(colour * alpha, alpha);
  }
`;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function chooseAnchors(data: RadarAuroraData | null, map: GlobeMap, width: number, height: number) {
  if (!data?.samples.length) return [] as AuroraAnchor[];
  const candidates = data.samples
    // OVATION can legitimately be quiet over the part of the oval in view.
    // Keep its lower confidence edge as a dim veil, rather than making the
    // space view look incorrectly empty until activity is strong.
    .filter((sample) => sample.probability >= 5)
    .flatMap((sample) => {
      // Project wrapped copies near the antimeridian too, otherwise a curtain
      // can disappear when a pilot orbits across the globe's seam.
      const copies = [sample.longitude, sample.longitude - 360, sample.longitude + 360];
      return copies.map((longitude) => {
        const point = map.project([longitude, sample.latitude]);
        return { ...sample, x: point.x, y: point.y };
      });
    })
    .filter((sample) => sample.x > -140 && sample.x < width + 140 && sample.y > -180 && sample.y < height + 180)
    .sort((left, right) => right.probability - left.probability);

  const anchors: AuroraAnchor[] = [];
  for (const candidate of candidates) {
    const minimumDistance = candidate.probability > 45 ? 36 : 52;
    if (anchors.some((anchor) => Math.hypot(anchor.x - candidate.x, anchor.y - candidate.y) < minimumDistance)) continue;
    anchors.push(candidate);
    if (anchors.length === MAX_CURTAINS) break;
  }
  return anchors;
}

function activityFor(data: RadarAuroraData | null) {
  if (!data?.samples.length) return 0;
  const active = data.samples.filter((sample) => sample.probability >= 5).map((sample) => sample.probability);
  if (!active.length) return 0.4;
  active.sort((left, right) => right - left);
  const topBand = active.slice(0, Math.max(1, Math.ceil(active.length * 0.12)));
  return clamp(0.46 + topBand.reduce((sum, probability) => sum + probability, 0) / topBand.length / 110, 0.46, 1);
}

export function BaRadarAuroraExperience({ map, data, enabled }: { map: GlobeMap | null; data: RadarAuroraData | null; enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef({ map, data, enabled });
  const inputVersionRef = useRef(0);
  inputRef.current = { map, data, enabled };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowPowerDevice = navigator.hardwareConcurrency != null && navigator.hardwareConcurrency <= 4;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !lowPowerDevice, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPowerDevice ? 1 : 1.35));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 1, 1800);
    camera.position.set(0, 0, WORLD_CAMERA_Z);
    camera.lookAt(0, 0, 0);

    const surface = new THREE.PlaneGeometry(1, 1, lowPowerDevice ? 14 : 22, lowPowerDevice ? 12 : 20).toNonIndexed();
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("position", surface.getAttribute("position"));
    geometry.setAttribute("normal", surface.getAttribute("normal"));
    geometry.setAttribute("uv", surface.getAttribute("uv"));
    geometry.instanceCount = MAX_CURTAINS;
    const offsets = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CURTAINS * 3), 3);
    const sizes = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CURTAINS * 2), 2);
    const seeds = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CURTAINS), 1);
    const strengths = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CURTAINS), 1);
    const layers = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CURTAINS), 1);
    for (let index = 0; index < MAX_CURTAINS; index += 1) {
      seeds.setX(index, ((index * 0.61803398875) % 1 + 1) % 1);
      offsets.setXYZ(index, 0, -10000, -1000);
      sizes.setXY(index, 0, 0);
      strengths.setX(index, 0);
      layers.setX(index, index % 4);
    }
    geometry.setAttribute("aOffset", offsets);
    geometry.setAttribute("aSize", sizes);
    geometry.setAttribute("aSeed", seeds);
    geometry.setAttribute("aStrength", strengths);
    geometry.setAttribute("aLayer", layers);

    const uniforms = {
      uTime: { value: 0 },
      uActivity: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: curtainVertexShader,
      fragmentShader: curtainFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const curtains = new THREE.Mesh(geometry, material);
    scene.add(curtains);

    const resize = () => {
      const viewport = map.getContainer();
      const width = Math.max(1, viewport.clientWidth);
      const height = Math.max(1, viewport.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const layout = () => {
      const input = inputRef.current;
      if (!input.map) return;
      const viewport = input.map.getContainer();
      const width = Math.max(1, viewport.clientWidth);
      const height = Math.max(1, viewport.clientHeight);
      const anchors = input.enabled ? chooseAnchors(input.data, input.map, width, height) : [];
      const zoom = input.map.getZoom();
      const focus = clamp((zoom + 0.55) / 2.6, 0.12, 1);
      const worldPerPixel = WORLD_HEIGHT / height;
      uniforms.uActivity.value = input.enabled ? activityFor(input.data) * (0.58 + focus * 0.42) : 0;

      for (let index = 0; index < MAX_CURTAINS; index += 1) {
        const anchor = anchors[index];
        if (!anchor) {
          offsets.setXYZ(index, 0, -10000, -1000);
          sizes.setXY(index, 0, 0);
          strengths.setX(index, 0);
          continue;
        }
        const strength = clamp(anchor.probability / 72, 0.18, 1);
        const fold = 0.72 + (((index * 0.61803398875) % 1 + 1) % 1) * 0.48;
        const widthPixels = (82 + focus * 158) * fold * (0.66 + strength * 0.58);
        const heightPixels = (92 + focus * Math.min(height * 0.72, 350)) * (0.48 + strength * 0.64);
        const worldX = (anchor.x - width / 2) * worldPerPixel;
        const worldY = (height / 2 - anchor.y) * worldPerPixel + heightPixels * worldPerPixel * 0.42;
        const depth = -30 - (index % 5) * 22 - strength * 34;
        offsets.setXYZ(index, worldX, worldY, depth);
        sizes.setXY(index, widthPixels * worldPerPixel, heightPixels * worldPerPixel);
        strengths.setX(index, strength);
      }
      offsets.needsUpdate = true;
      sizes.needsUpdate = true;
      strengths.needsUpdate = true;
    };

    let layoutFrame = 0;
    const requestLayout = () => {
      window.cancelAnimationFrame(layoutFrame);
      layoutFrame = window.requestAnimationFrame(layout);
    };
    resize();
    layout();
    map.on("move", requestLayout);
    map.on("zoom", requestLayout);
    map.on("rotate", requestLayout);
    map.on("resize", resize);

    let frame = 0;
    let previous = 0;
    let appliedInputVersion = inputVersionRef.current;
    const targetFrameInterval = reducedMotion ? 1000 : lowPowerDevice ? 1000 / 24 : 1000 / 36;
    const render = (now: number) => {
      frame = window.requestAnimationFrame(render);
      if (document.visibilityState !== "visible" || now - previous < targetFrameInterval) return;
      previous = now;
      if (appliedInputVersion !== inputVersionRef.current) {
        appliedInputVersion = inputVersionRef.current;
        layout();
      }
      uniforms.uTime.value = now / 1000;
      renderer.render(scene, camera);
    };
    frame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(layoutFrame);
      map.off("move", requestLayout);
      map.off("zoom", requestLayout);
      map.off("rotate", requestLayout);
      map.off("resize", resize);
      surface.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [map]);

  useEffect(() => {
    // The GPU loop picks the new NOAA field up without rebuilding the scene.
    inputVersionRef.current += 1;
  }, [map, data, enabled]);

  return <canvas ref={canvasRef} className="ba-radar-globe-aurora-experience" aria-hidden="true" />;
}
