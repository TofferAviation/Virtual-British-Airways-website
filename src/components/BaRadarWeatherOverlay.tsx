"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { ConvectiveRiskPoint, WindVector } from "@/lib/radar-external";

type Particle = { x: number; y: number; age: number; maxAge: number };

function canvasFor(className: string, zIndex: number) {
  const canvas = document.createElement("canvas");
  canvas.className = className;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.zIndex = String(zIndex);
  return canvas;
}

function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

function longitudeDistance(a: number, b: number) {
  const difference = Math.abs(a - b);
  return difference > 180 ? 360 - difference : difference;
}

function modelWindAt(latitude: number, longitude: number, winds: WindVector[]) {
  if (!winds.length) return null;
  const closest: Array<{ wind: WindVector; distance: number }> = [];
  const longitudeScale = Math.max(0.2, Math.cos(latitude * Math.PI / 180));
  for (const wind of winds) {
    const latitudeDistance = wind.latitude - latitude;
    const longitudeDifference = longitudeDistance(wind.longitude, longitude) * longitudeScale;
    const distance = latitudeDistance ** 2 + longitudeDifference ** 2;
    const entry = { wind, distance };
    const insertionPoint = closest.findIndex((candidate) => candidate.distance > distance);
    if (insertionPoint === -1) closest.push(entry);
    else closest.splice(insertionPoint, 0, entry);
    if (closest.length > 4) closest.pop();
  }
  let east = 0;
  let north = 0;
  let weightTotal = 0;
  for (const { wind, distance } of closest) {
    const weight = 1 / Math.max(0.0001, distance);
    const radians = wind.directionDeg * Math.PI / 180;
    // Aviation wind directions describe where the wind is coming from.
    east += -Math.sin(radians) * wind.speedKt * weight;
    north += -Math.cos(radians) * wind.speedKt * weight;
    weightTotal += weight;
  }
  if (!weightTotal) return null;
  east /= weightTotal;
  north /= weightTotal;
  return { east, north, speedKt: Math.hypot(east, north) };
}

function windColour(speedKt: number) {
  if (speedKt >= 75) return "rgba(255, 111, 83, 0.86)";
  if (speedKt >= 50) return "rgba(255, 213, 103, 0.84)";
  if (speedKt >= 30) return "rgba(107, 236, 190, 0.82)";
  return "rgba(104, 204, 255, 0.78)";
}

function outlookColour(capeJkg: number) {
  if (capeJkg >= 2_000) return [196, 74, 216] as const;
  if (capeJkg >= 1_000) return [238, 78, 65] as const;
  return [242, 171, 64] as const;
}

export function BaRadarWeatherOverlay({
  winds,
  convectiveRisk,
  showWinds,
  showConvectiveOutlook,
}: {
  winds: WindVector[];
  convectiveRisk: ConvectiveRiskPoint[];
  showWinds: boolean;
  showConvectiveOutlook: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!showWinds && !showConvectiveOutlook) return;
    const container = map.getContainer();
    const outlookCanvas = canvasFor("ba-radar-convective-outlook", 430);
    const windCanvas = canvasFor("ba-radar-wind-flow", 440);
    container.append(outlookCanvas, windCanvas);
    let outlookContext: CanvasRenderingContext2D | null = null;
    let windContext: CanvasRenderingContext2D | null = null;
    let particles: Particle[] = [];
    let frame = 0;

    const seedParticle = (width: number, height: number): Particle => ({
      x: Math.random() * width,
      y: Math.random() * height,
      age: Math.random() * 120,
      maxAge: 90 + Math.random() * 100,
    });

    const drawOutlook = () => {
      if (!outlookContext) return;
      const { x: width, y: height } = map.getSize();
      outlookContext.clearRect(0, 0, width, height);
      if (!showConvectiveOutlook || !convectiveRisk.length) return;
      const radius = Math.max(120, Math.sqrt((width * height) / convectiveRisk.length) * 1.45);
      for (const point of convectiveRisk) {
        const position = map.latLngToContainerPoint([point.latitude, point.longitude]);
        if (position.x < -radius || position.x > width + radius || position.y < -radius || position.y > height + radius) continue;
        const [red, green, blue] = outlookColour(point.capeJkg);
        const gradient = outlookContext.createRadialGradient(position.x, position.y, 0, position.x, position.y, radius);
        gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, 0.2)`);
        gradient.addColorStop(0.5, `rgba(${red}, ${green}, ${blue}, 0.09)`);
        gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
        outlookContext.fillStyle = gradient;
        outlookContext.fillRect(position.x - radius, position.y - radius, radius * 2, radius * 2);
      }
    };

    const resize = () => {
      const { x: width, y: height } = map.getSize();
      outlookContext = resizeCanvas(outlookCanvas, width, height);
      windContext = resizeCanvas(windCanvas, width, height);
      particles = Array.from({ length: Math.max(220, Math.min(520, Math.round((width * height) / 4_000))) }, () => seedParticle(width, height));
      drawOutlook();
    };

    const animateWind = () => {
      if (!windContext || !showWinds) return;
      const { x: width, y: height } = map.getSize();
      windContext.globalCompositeOperation = "destination-in";
      windContext.fillStyle = "rgba(0, 0, 0, 0.92)";
      windContext.fillRect(0, 0, width, height);
      windContext.globalCompositeOperation = "source-over";
      for (const particle of particles) {
        const location = map.containerPointToLatLng([particle.x, particle.y]);
        const wind = modelWindAt(location.lat, location.lng, winds);
        if (!wind) {
          Object.assign(particle, seedParticle(width, height));
          continue;
        }
        const oldX = particle.x;
        const oldY = particle.y;
        const step = Math.max(0.28, Math.min(3.8, wind.speedKt * 0.032));
        particle.x += wind.east * step / Math.max(wind.speedKt, 1);
        particle.y -= wind.north * step / Math.max(wind.speedKt, 1);
        particle.age += 1;
        if (particle.age > particle.maxAge || particle.x < -8 || particle.x > width + 8 || particle.y < -8 || particle.y > height + 8) {
          Object.assign(particle, seedParticle(width, height));
          continue;
        }
        windContext.strokeStyle = windColour(wind.speedKt);
        windContext.lineWidth = wind.speedKt >= 50 ? 1.45 : 1.1;
        windContext.beginPath();
        windContext.moveTo(oldX, oldY);
        windContext.lineTo(particle.x, particle.y);
        windContext.stroke();
      }
      frame = window.requestAnimationFrame(animateWind);
    };

    resize();
    map.on("resize moveend zoomend", resize);
    if (showWinds && winds.length) frame = window.requestAnimationFrame(animateWind);
    return () => {
      window.cancelAnimationFrame(frame);
      map.off("resize moveend zoomend", resize);
      outlookCanvas.remove();
      windCanvas.remove();
    };
  }, [convectiveRisk, map, showConvectiveOutlook, showWinds, winds]);

  return null;
}
