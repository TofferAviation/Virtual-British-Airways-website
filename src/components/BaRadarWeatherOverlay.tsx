"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { ConvectiveRiskPoint, WindVector } from "@/lib/radar-external";

type GeoPoint = { latitude: number; longitude: number };
type ScreenPoint = { x: number; y: number };
type WindFlow = { east: number; north: number; speedKt: number };
type ScreenWind = { x: number; y: number; speedKt: number };
type WindParticle = ScreenPoint & { age: number; maxAge: number; speedKt: number };

type WindField = {
  latitudes: number[];
  longitudes: number[];
  values: Map<string, WindFlow>;
  fallback: WindVector[];
};

type ScreenWindField = {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  values: ScreenWind[];
};

const MAX_LATITUDE = 85;
const TARGET_FRAME_MS = 1000 / 32;

function canvasFor(className: string, zIndex: number) {
  const canvas = document.createElement("canvas");
  canvas.className = className;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.zIndex = String(zIndex);
  return canvas;
}

function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
  // A device-pixel-ratio canvas would make every animation frame several times
  // more expensive on high-resolution displays. This layer prioritises a smooth
  // flight-planning map over imperceptibly sharper individual particles.
  const ratio = 1;
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d", { alpha: true });
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

function windAtScreen(field: ScreenWindField, x: number, y: number): ScreenWind | null {
  if (!field.values.length) return null;
  const xIndex = Math.max(0, Math.min(field.columns - 2, Math.floor(x / field.cellWidth)));
  const yIndex = Math.max(0, Math.min(field.rows - 2, Math.floor(y / field.cellHeight)));
  const horizontal = Math.max(0, Math.min(1, (x - xIndex * field.cellWidth) / field.cellWidth));
  const vertical = Math.max(0, Math.min(1, (y - yIndex * field.cellHeight) / field.cellHeight));
  const southwest = field.values[yIndex * field.columns + xIndex];
  const southeast = field.values[yIndex * field.columns + xIndex + 1];
  const northwest = field.values[(yIndex + 1) * field.columns + xIndex];
  const northeast = field.values[(yIndex + 1) * field.columns + xIndex + 1];
  if (!southwest || !southeast || !northwest || !northeast) return null;
  const interpolate = (southwestValue: number, southeastValue: number, northwestValue: number, northeastValue: number) => {
    const southValue = southwestValue + (southeastValue - southwestValue) * horizontal;
    const northValue = northwestValue + (northeastValue - northwestValue) * horizontal;
    return southValue + (northValue - southValue) * vertical;
  };
  return {
    x: interpolate(southwest.x, southeast.x, northwest.x, northeast.x),
    y: interpolate(southwest.y, southeast.y, northwest.y, northeast.y),
    speedKt: interpolate(southwest.speedKt, southeast.speedKt, northwest.speedKt, northeast.speedKt),
  };
}

function seedParticle(width: number, height: number): WindParticle {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    age: Math.random() * 90,
    maxAge: 80 + Math.random() * 100,
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
    let screenField: ScreenWindField | null = null;
    let frame = 0;
    let lastDrawTimestamp = 0;
    let mapIsMoving = false;
    const field = buildWindField(winds);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const mapSize = () => map.getSize();
    const scheduleFrame = () => {
      if (!frame && showWinds && field && !reduceMotion && !document.hidden && !mapIsMoving) {
        frame = window.requestAnimationFrame(animateWind);
      }
    };

    const drawOutlook = () => {
      if (!outlookContext) return;
      const { x: width, y: height } = mapSize();
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

    const buildScreenField = () => {
      if (!field) return null;
      const { x: width, y: height } = mapSize();
      const cellSize = 112;
      const columns = Math.max(6, Math.ceil(width / cellSize) + 1);
      const rows = Math.max(5, Math.ceil(height / cellSize) + 1);
      const cellWidth = width / (columns - 1);
      const cellHeight = height / (rows - 1);
      const values: ScreenWind[] = [];
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = column * cellWidth;
          const y = row * cellHeight;
          const location = map.containerPointToLatLng([x, y]);
          const wind = modelWindAt(field, location.lat, location.lng);
          if (!wind || wind.speedKt < 0.2) {
            values.push({ x: 0, y: 0, speedKt: 0 });
            continue;
          }
          const latitudeOffset = Math.sign(wind.north || 1) * 0.18;
          const longitudeOffset = Math.sign(wind.east || 1) * 0.18 / Math.max(0.2, Math.cos(location.lat * Math.PI / 180));
          const bearingPoint = pointFromMap(map, {
            latitude: Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, location.lat + latitudeOffset)),
            longitude: normaliseLongitude(location.lng + longitudeOffset),
          });
          const directionX = bearingPoint.x - x;
          const directionY = bearingPoint.y - y;
          const magnitude = Math.hypot(directionX, directionY);
          values.push(magnitude < 0.001
            ? { x: 0, y: 0, speedKt: wind.speedKt }
            : { x: directionX / magnitude, y: directionY / magnitude, speedKt: wind.speedKt });
        }
      }
      return { columns, rows, cellWidth, cellHeight, values };
    };

    const drawWindTint = () => {
      if (!windTintContext) return;
      const { x: width, y: height } = mapSize();
      windTintContext.clearRect(0, 0, width, height);
      if (!showWinds || !screenField) return;
      // A small, static colour wash gives strength context without the expensive
      // per-frame blur and re-projection that caused the original map lag.
      const tintCellSize = 112;
      for (let y = 0; y < height; y += tintCellSize) {
        for (let x = 0; x < width; x += tintCellSize) {
          const wind = windAtScreen(screenField, x + tintCellSize / 2, y + tintCellSize / 2);
          if (!wind) continue;
          const [red, green, blue] = windTintColour(wind.speedKt);
          windTintContext.fillStyle = `rgba(${red}, ${green}, ${blue}, 0.12)`;
          windTintContext.fillRect(x, y, tintCellSize + 1, tintCellSize + 1);
        }
      }
    };

    const configureMapView = () => {
      const { x: width, y: height } = mapSize();
      screenField = buildScreenField();
      particles = Array.from(
        { length: Math.max(100, Math.min(180, Math.round((width * height) / 12_500))) },
        () => seedParticle(width, height),
      );
      windContext?.clearRect(0, 0, width, height);
      drawWindTint();
      drawOutlook();
    };

    const resize = () => {
      const { x: width, y: height } = mapSize();
      windTintContext = resizeCanvas(windTintCanvas, width, height);
      outlookContext = resizeCanvas(outlookCanvas, width, height);
      windContext = resizeCanvas(windCanvas, width, height);
      configureMapView();
    };

    const animateWind = (timestamp: number) => {
      if (!windContext || !showWinds || !screenField || reduceMotion || document.hidden) {
        frame = 0;
        return;
      }
      if (mapIsMoving) {
        frame = 0;
        return;
      }
      if (timestamp - lastDrawTimestamp < TARGET_FRAME_MS) {
        frame = 0;
        scheduleFrame();
        return;
      }
      frame = 0;
      const elapsed = Math.min(2, Math.max(0.55, (timestamp - lastDrawTimestamp || TARGET_FRAME_MS) / TARGET_FRAME_MS));
      lastDrawTimestamp = timestamp;
      const { x: width, y: height } = mapSize();

      // Fade the previous stroke instead of clearing and rebuilding every trail.
      // Each frame now draws one inexpensive line per particle.
      windContext.save();
      windContext.globalCompositeOperation = "destination-in";
      windContext.fillStyle = "rgba(0, 0, 0, 0.84)";
      windContext.fillRect(0, 0, width, height);
      windContext.restore();
      windContext.lineCap = "round";
      windContext.lineWidth = 1.15;

      for (let index = 0; index < particles.length; index += 1) {
        const particle = particles[index];
        const wind = windAtScreen(screenField, particle.x, particle.y);
        if (!wind || particle.age > particle.maxAge || wind.speedKt < 0.2) {
          particles[index] = seedParticle(width, height);
          continue;
        }
        const distance = Math.min(3.4, 0.45 + wind.speedKt * 0.045) * elapsed;
        const nextX = particle.x + wind.x * distance;
        const nextY = particle.y + wind.y * distance;
        if (nextX < -5 || nextX > width + 5 || nextY < -5 || nextY > height + 5) {
          particles[index] = seedParticle(width, height);
          continue;
        }
        windContext.strokeStyle = windColour(wind.speedKt, 0.82);
        windContext.lineWidth = wind.speedKt >= 50 ? 1.45 : 1.1;
        windContext.beginPath();
        windContext.moveTo(particle.x, particle.y);
        windContext.lineTo(nextX, nextY);
        windContext.stroke();
        particle.x = nextX;
        particle.y = nextY;
        particle.speedKt = wind.speedKt;
        particle.age += elapsed;
      }
      scheduleFrame();
    };

    const pauseForMapMove = () => {
      mapIsMoving = true;
      window.cancelAnimationFrame(frame);
      frame = 0;
    };
    const resumeAfterMapMove = () => {
      mapIsMoving = false;
      configureMapView();
      lastDrawTimestamp = performance.now();
      scheduleFrame();
    };
    const refreshForVisibility = () => {
      if (!document.hidden) {
        configureMapView();
        lastDrawTimestamp = performance.now();
        scheduleFrame();
      }
    };

    resize();
    map.on("resize", resize);
    map.on("movestart zoomstart", pauseForMapMove);
    map.on("moveend zoomend", resumeAfterMapMove);
    document.addEventListener("visibilitychange", refreshForVisibility);
    scheduleFrame();
    return () => {
      window.cancelAnimationFrame(frame);
      map.off("resize", resize);
      map.off("movestart zoomstart", pauseForMapMove);
      map.off("moveend zoomend", resumeAfterMapMove);
      document.removeEventListener("visibilitychange", refreshForVisibility);
      windTintCanvas.remove();
      outlookCanvas.remove();
      windCanvas.remove();
    };
  }, [convectiveRisk, map, showConvectiveOutlook, showWinds, winds]);

  return null;
}
