"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { ConvectiveRiskPoint, WindVector } from "@/lib/radar-external";

type GeoPoint = { latitude: number; longitude: number };
type ScreenPoint = { x: number; y: number };
type WindFlow = { east: number; north: number; speedKt: number };
type WindParticle = GeoPoint & {
  age: number;
  maxAge: number;
  trail: GeoPoint[];
  speedKt: number;
};

type WindField = {
  latitudes: number[];
  longitudes: number[];
  values: Map<string, WindFlow>;
  fallback: WindVector[];
};

const MAX_LATITUDE = 85;
const TRAIL_POINTS = 16;

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

function normaliseLongitude(longitude: number) {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function longitudeDistance(a: number, b: number) {
  const difference = Math.abs(a - b);
  return difference > 180 ? 360 - difference : difference;
}

function gridKey(latitude: number, longitude: number) {
  return `${latitude}:${longitude}`;
}

function windFlow(wind: WindVector): WindFlow {
  const radians = wind.directionDeg * Math.PI / 180;
  // Aviation wind directions describe where the wind is coming from.
  return {
    east: -Math.sin(radians) * wind.speedKt,
    north: -Math.cos(radians) * wind.speedKt,
    speedKt: wind.speedKt,
  };
}

function buildWindField(winds: WindVector[]): WindField | null {
  if (!winds.length) return null;
  const values = new Map<string, WindFlow>();
  const latitudes = [...new Set(winds.map((wind) => wind.latitude))].sort((a, b) => a - b);
  const longitudes = [...new Set(winds.map((wind) => wind.longitude))].sort((a, b) => a - b);
  for (const wind of winds) values.set(gridKey(wind.latitude, wind.longitude), windFlow(wind));
  return { latitudes, longitudes, values, fallback: winds };
}

function edgesForLatitude(latitudes: number[], latitude: number) {
  if (latitude <= latitudes[0]) return [latitudes[0], latitudes[0]] as const;
  if (latitude >= latitudes.at(-1)!) return [latitudes.at(-1)!, latitudes.at(-1)!] as const;
  const northIndex = latitudes.findIndex((entry) => entry >= latitude);
  return [latitudes[northIndex - 1], latitudes[northIndex]] as const;
}

function edgesForLongitude(longitudes: number[], longitude: number) {
  const target = normaliseLongitude(longitude);
  const first = longitudes[0];
  const last = longitudes.at(-1)!;
  if (target < first || target > last) {
    return target < first ? [last, first + 360, target + 360] as const : [last, first + 360, target] as const;
  }
  const eastIndex = longitudes.findIndex((entry) => entry >= target);
  if (eastIndex === 0) return [first, first, target] as const;
  return [longitudes[eastIndex - 1], longitudes[eastIndex], target] as const;
}

function nearestWind(winds: WindVector[], latitude: number, longitude: number): WindFlow | null {
  let closest: { wind: WindVector; distance: number } | null = null;
  const longitudeScale = Math.max(0.2, Math.cos(latitude * Math.PI / 180));
  for (const wind of winds) {
    const distance = (wind.latitude - latitude) ** 2 + (longitudeDistance(wind.longitude, longitude) * longitudeScale) ** 2;
    if (!closest || distance < closest.distance) closest = { wind, distance };
  }
  return closest ? windFlow(closest.wind) : null;
}

function modelWindAt(field: WindField, latitude: number, longitude: number): WindFlow | null {
  const [south, north] = edgesForLatitude(field.latitudes, latitude);
  const [west, east, targetLongitude] = edgesForLongitude(field.longitudes, longitude);
  const normalisedWest = normaliseLongitude(west);
  const normalisedEast = normaliseLongitude(east);
  const southwest = field.values.get(gridKey(south, normalisedWest));
  const southeast = field.values.get(gridKey(south, normalisedEast));
  const northwest = field.values.get(gridKey(north, normalisedWest));
  const northeast = field.values.get(gridKey(north, normalisedEast));
  if (!southwest || !southeast || !northwest || !northeast) return nearestWind(field.fallback, latitude, longitude);

  const longitudeSpan = Math.max(0.0001, east - west);
  const latitudeSpan = Math.max(0.0001, north - south);
  const horizontal = Math.max(0, Math.min(1, (targetLongitude - west) / longitudeSpan));
  const vertical = Math.max(0, Math.min(1, (latitude - south) / latitudeSpan));
  const interpolate = (southwestValue: number, southeastValue: number, northwestValue: number, northeastValue: number) => {
    const southValue = southwestValue + (southeastValue - southwestValue) * horizontal;
    const northValue = northwestValue + (northeastValue - northwestValue) * horizontal;
    return southValue + (northValue - southValue) * vertical;
  };
  const eastward = interpolate(southwest.east, southeast.east, northwest.east, northeast.east);
  const northward = interpolate(southwest.north, southeast.north, northwest.north, northeast.north);
  return { east: eastward, north: northward, speedKt: Math.hypot(eastward, northward) };
}

function windColour(speedKt: number, opacity: number) {
  if (speedKt >= 75) return `rgba(255, 116, 82, ${opacity})`;
  if (speedKt >= 50) return `rgba(255, 214, 105, ${opacity})`;
  if (speedKt >= 30) return `rgba(107, 237, 191, ${opacity})`;
  return `rgba(142, 219, 255, ${opacity})`;
}

function windTintColour(speedKt: number) {
  if (speedKt >= 75) return [196, 61, 152] as const;
  if (speedKt >= 55) return [241, 91, 74] as const;
  if (speedKt >= 38) return [243, 188, 72] as const;
  if (speedKt >= 22) return [87, 192, 121] as const;
  return [65, 146, 207] as const;
}

function outlookColour(capeJkg: number) {
  if (capeJkg >= 2_000) return [196, 74, 216] as const;
  if (capeJkg >= 1_000) return [238, 78, 65] as const;
  return [242, 171, 64] as const;
}

function pointFromMap(map: ReturnType<typeof useMap>, point: GeoPoint): ScreenPoint {
  const projected = map.latLngToContainerPoint([point.latitude, point.longitude]);
  return { x: projected.x, y: projected.y };
}

function seedParticle(map: ReturnType<typeof useMap>): WindParticle {
  const bounds = map.getBounds();
  const latitude = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, bounds.getSouth() + Math.random() * (bounds.getNorth() - bounds.getSouth())));
  const longitude = normaliseLongitude(bounds.getWest() + Math.random() * (bounds.getEast() - bounds.getWest()));
  return {
    latitude,
    longitude,
    age: Math.random() * 90,
    maxAge: 120 + Math.random() * 100,
    trail: [],
    speedKt: 0,
  };
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
    const windTintCanvas = canvasFor("ba-radar-wind-tint", 420);
    const outlookCanvas = canvasFor("ba-radar-convective-outlook", 430);
    const windCanvas = canvasFor("ba-radar-wind-flow", 440);
    container.append(windTintCanvas, outlookCanvas, windCanvas);
    let windTintContext: CanvasRenderingContext2D | null = null;
    let outlookContext: CanvasRenderingContext2D | null = null;
    let windContext: CanvasRenderingContext2D | null = null;
    let particles: WindParticle[] = [];
    let frame = 0;
    let lastTimestamp = performance.now();
    const field = buildWindField(winds);

    const drawOutlook = () => {
      if (!outlookContext) return;
      const { x: width, y: height } = map.getSize();
      outlookContext.clearRect(0, 0, width, height);
      if (!showConvectiveOutlook || !convectiveRisk.length) return;
      const radius = Math.max(140, Math.sqrt((width * height) / convectiveRisk.length) * 1.7);
      for (const point of convectiveRisk) {
        const position = pointFromMap(map, point);
        if (position.x < -radius || position.x > width + radius || position.y < -radius || position.y > height + radius) continue;
        const [red, green, blue] = outlookColour(point.capeJkg);
        const gradient = outlookContext.createRadialGradient(position.x, position.y, 0, position.x, position.y, radius);
        gradient.addColorStop(0, `rgba(${red}, ${green}, ${blue}, 0.23)`);
        gradient.addColorStop(0.48, `rgba(${red}, ${green}, ${blue}, 0.1)`);
        gradient.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
        outlookContext.fillStyle = gradient;
        outlookContext.fillRect(position.x - radius, position.y - radius, radius * 2, radius * 2);
      }
    };

    const drawWindTint = () => {
      if (!windTintContext) return;
      const { x: width, y: height } = map.getSize();
      windTintContext.clearRect(0, 0, width, height);
      if (!showWinds || !field) return;
      const cellSize = 52;
      windTintContext.filter = "blur(20px)";
      for (let y = -cellSize; y < height + cellSize; y += cellSize) {
        for (let x = -cellSize; x < width + cellSize; x += cellSize) {
          const location = map.containerPointToLatLng([x + cellSize / 2, y + cellSize / 2]);
          const wind = modelWindAt(field, location.lat, location.lng);
          if (!wind) continue;
          const [red, green, blue] = windTintColour(wind.speedKt);
          windTintContext.fillStyle = `rgba(${red}, ${green}, ${blue}, 0.22)`;
          windTintContext.fillRect(x - cellSize / 2, y - cellSize / 2, cellSize * 2, cellSize * 2);
        }
      }
      windTintContext.filter = "none";
    };

    const resize = () => {
      const { x: width, y: height } = map.getSize();
      windTintContext = resizeCanvas(windTintCanvas, width, height);
      outlookContext = resizeCanvas(outlookCanvas, width, height);
      windContext = resizeCanvas(windCanvas, width, height);
      if (!particles.length) {
        const count = Math.max(360, Math.min(780, Math.round((width * height) / 1_250)));
        particles = Array.from({ length: count }, () => seedParticle(map));
      }
      drawWindTint();
      drawOutlook();
    };

    const refreshVisibleParticles = () => {
      const visibleBounds = map.getBounds().pad(0.04);
      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        if (!visibleBounds.contains([particle.latitude, particle.longitude])) particles[index] = seedParticle(map);
      }
      drawWindTint();
      drawOutlook();
    };

    const reprojectParticle = (particle: WindParticle, wind: WindFlow, elapsed: number) => {
      const current = pointFromMap(map, particle);
      const latitudeOffset = wind.north === 0 ? 0 : Math.sign(wind.north) * 0.18;
      const longitudeOffset = wind.east === 0 ? 0 : Math.sign(wind.east) * 0.18 / Math.max(0.2, Math.cos(particle.latitude * Math.PI / 180));
      const bearingPoint = pointFromMap(map, {
        latitude: Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, particle.latitude + latitudeOffset)),
        longitude: normaliseLongitude(particle.longitude + longitudeOffset),
      });
      const xDirection = bearingPoint.x - current.x;
      const yDirection = bearingPoint.y - current.y;
      const magnitude = Math.hypot(xDirection, yDirection);
      if (magnitude < 0.001) return null;
      const distance = Math.max(1.15, Math.min(5.8, 0.65 + wind.speedKt * 0.075)) * elapsed;
      return map.containerPointToLatLng([current.x + xDirection / magnitude * distance, current.y + yDirection / magnitude * distance]);
    };

    const drawTrail = (particle: WindParticle) => {
      if (!windContext || !particle.trail.length) return;
      const points = [{ latitude: particle.latitude, longitude: particle.longitude }, ...particle.trail];
      const projected = points.map((point) => pointFromMap(map, point));
      windContext.lineCap = "round";
      for (let index = 0; index < projected.length - 1; index += 1) {
        const opacity = Math.max(0.035, 0.88 - index * 0.055);
        windContext.strokeStyle = windColour(particle.speedKt, opacity);
        windContext.lineWidth = particle.speedKt >= 50 ? 1.65 : 1.25;
        windContext.shadowBlur = index < 3 ? 2.5 : 0;
        windContext.shadowColor = windColour(particle.speedKt, Math.min(0.5, opacity));
        windContext.beginPath();
        windContext.moveTo(projected[index].x, projected[index].y);
        windContext.lineTo(projected[index + 1].x, projected[index + 1].y);
        windContext.stroke();
      }
      windContext.shadowBlur = 0;
    };

    const animateWind = (timestamp: number) => {
      if (!windContext || !showWinds || !field) return;
      const elapsed = Math.max(0.35, Math.min(2.2, (timestamp - lastTimestamp) / 16.67));
      lastTimestamp = timestamp;
      const { x: width, y: height } = map.getSize();
      windContext.clearRect(0, 0, width, height);
      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        const wind = modelWindAt(field, particle.latitude, particle.longitude);
        if (!wind || particle.age > particle.maxAge) {
          particles[index] = seedParticle(map);
          continue;
        }
        const nextPoint = reprojectParticle(particle, wind, elapsed);
        if (!nextPoint || Math.abs(nextPoint.lat) > MAX_LATITUDE) {
          particles[index] = seedParticle(map);
          continue;
        }
        particle.trail.unshift({ latitude: particle.latitude, longitude: particle.longitude });
        particle.trail.length = Math.min(TRAIL_POINTS, particle.trail.length);
        particle.latitude = nextPoint.lat;
        particle.longitude = normaliseLongitude(nextPoint.lng);
        particle.speedKt = wind.speedKt;
        particle.age += elapsed;
        drawTrail(particle);
      }
      frame = window.requestAnimationFrame(animateWind);
    };

    resize();
    map.on("resize", resize);
    map.on("moveend zoomend", refreshVisibleParticles);
    if (showWinds && field) frame = window.requestAnimationFrame(animateWind);
    return () => {
      window.cancelAnimationFrame(frame);
      map.off("resize", resize);
      map.off("moveend zoomend", refreshVisibleParticles);
      windTintCanvas.remove();
      outlookCanvas.remove();
      windCanvas.remove();
    };
  }, [convectiveRisk, map, showConvectiveOutlook, showWinds, winds]);

  return null;
}
