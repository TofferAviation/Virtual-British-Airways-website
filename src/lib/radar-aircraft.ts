import {WGS84_A_KM,WGS84_B_KM} from "./radar-globe-geodesy.ts";

/** Aircraft dimensions in metres; Earth/render coordinates elsewhere use kilometres. */
export type AircraftModel = { key: string; label: string; lengthM: number; spanM: number; match: "type" | "family" };
const fleet: Record<string, [string, string, number, number]> = {
  A318: ["a318", "Airbus A318", 31.44, 34.1],
  A319: ["a319", "Airbus A319", 33.84, 34.1],
  A320: ["a320", "Airbus A320", 37.57, 34.1],
  A321: ["a321", "Airbus A321", 44.51, 34.1],
  A332: ["a332", "Airbus A330-200", 58.82, 60.3],
  A333: ["a333", "Airbus A330-300", 63.66, 60.3],
  A359: ["a359", "Airbus A350-900", 66.8, 64.75],
  A388: ["a380", "Airbus A380-800", 72.72, 79.75],
  B738: ["b738", "Boeing 737-800", 39.47, 35.8],
  B744: ["b744", "Boeing 747-400", 70.67, 64.44],
  B772: ["b772", "Boeing 777-200", 63.73, 60.93],
  B773: ["b773", "Boeing 777-300", 73.86, 60.93],
  B788: ["b788", "Boeing 787-8", 56.72, 60.12],
  B789: ["b789", "Boeing 787-9", 62.81, 60.12],
};
const family: Record<string, string> = { A19N: "A319", A20N: "A320", A21N: "A321", B77L: "B772", B77W: "B773" };

/** Never silently represent an unknown type as an A380 or claim a family substitute is exact. */
export function resolveAircraftModel(name: string): AircraftModel | null {
  const text = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const code = Object.keys(fleet).find(k => text === k || text.startsWith(k + "AIR"))
    ?? Object.keys(family).find(k => text === k)
    ?? (/A380|A388/.test(text) ? "A388"
      : /A350900|A359/.test(text) ? "A359"
      : /A330200|A332/.test(text) ? "A332"
      : /A330300|A333/.test(text) ? "A333"
      : /A319NEO/.test(text) ? "A19N" : /A320NEO/.test(text) ? "A20N" : /A321NEO/.test(text) ? "A21N"
      : /A318/.test(text) ? "A318" : /A319/.test(text) ? "A319" : /A320/.test(text) ? "A320" : /A321/.test(text) ? "A321"
      : /777300ER|B77W/.test(text) ? "B77W" : /777200LR|B77L/.test(text) ? "B77L"
      : /777200|B772/.test(text) ? "B772" : /777300|B773/.test(text) ? "B773"
      : /787900|7879|B789/.test(text) ? "B789" : /787800|7878|B788/.test(text) ? "B788"
      : /747400|B744/.test(text) ? "B744" : /737800|B738/.test(text) ? "B738" : null);
  if (!code) return null;
  const [key, label, lengthM, spanM] = fleet[family[code] ?? code];
  return { key, label, lengthM, spanM, match: family[code] ? "family" : "type" };
}

export const DEFAULT_AIRCRAFT_CLOSE_SCALE=1.75;

/** Visual scaling never changes telemetry. The selected plane gains a smooth,
 * bounded close-up boost within 15 km; 100% restores the original true-size view.
 * Both LODs use exactly the same size, including while detail is loading. */
export function aircraftDisplay(lengthM:number,rangeKm:number,fov:number,pixelsHigh:number,selected:boolean,closeScale=DEFAULT_AIRCRAFT_CLOSE_SCALE) {
  const kmPerPixel=Math.max(1e-8,2*Math.max(.001,rangeKm)*Math.tan(Math.max(1,fov)*Math.PI/360)/Math.max(1,pixelsHigh));
  const naturalPixels=Math.max(1,lengthM)/1000/kmPerPixel;
  const baseScale=.001*Math.max(1,(selected?44:30)/naturalPixels);
  const t=Math.max(0,Math.min(1,(rangeKm-.5)/14.5));
  const proximity=1-t*t*(3-2*t);
  const requested=Number.isFinite(closeScale)?Math.max(1,Math.min(2.5,closeScale)):DEFAULT_AIRCRAFT_CLOSE_SCALE;
  const closeBoost=selected?1+(requested-1)*proximity:1;
  return {scale:baseScale*closeBoost,naturalPixels,closeBoost,mapOverlay:baseScale>.0010001,highDetail:naturalPixels*closeBoost>=64};
}

/** Cull the entire enlarged marker by its real centre, not the enlarged wings.
 * Segment/ellipsoid test works over the poles and horizon, including ground traffic. */
export function aircraftAboveHorizon(camera:readonly number[],position:readonly number[]) {
  const axes=[WGS84_A_KM,WGS84_B_KM,WGS84_A_KM];
  const c=camera.map((v,i)=>v/axes[i]),p=position.map((v,i)=>v/axes[i]),d=p.map((v,i)=>v-c[i]);
  const a=d.reduce((sum,v)=>sum+v*v,0);
  if(a<1e-16)return true;
  const t=Math.max(0,Math.min(1,-c.reduce((sum,v,i)=>sum+v*d[i],0)/a));
  return c.reduce((sum,v,i)=>sum+(v+t*d[i])**2,0)>=1-1e-8;
}

export type FlightTrackPoint = { latitude: number; longitude: number; altitudeFt?: number | null; onGround?: boolean; timestamp?: string };
export function flightAltitudeMetres(point: Pick<FlightTrackPoint, "altitudeFt">): number | null {
  return typeof point.altitudeFt === "number" && Number.isFinite(point.altitudeFt) ? point.altitudeFt * 0.3048 : null;
}

/** Local right/up/back axes for a Y-up model whose nose points along -Z. Heading is true north clockwise. */
export function aircraftFrame(latitude: number, longitude: number, headingDeg: number) {
  const phi = latitude * Math.PI / 180, lambda = longitude * Math.PI / 180;
  const heading = (Number.isFinite(headingDeg) ? headingDeg : 0) * Math.PI / 180;
  const up: [number, number, number] = [Math.cos(phi) * Math.sin(lambda), Math.sin(phi), Math.cos(phi) * Math.cos(lambda)];
  const east = [Math.cos(lambda), 0, -Math.sin(lambda)];
  const north = [-Math.sin(phi) * Math.sin(lambda), Math.cos(phi), -Math.sin(phi) * Math.cos(lambda)];
  const forward = north.map((n, i) => n * Math.cos(heading) + east[i] * Math.sin(heading));
  const right = east.map((e, i) => e * Math.cos(heading) - north[i] * Math.sin(heading));
  return { right, up, back: forward.map(n => -n) };
}

/** A bounded sample count, shortest dateline crossing and interpolated measured altitude. Unknowns break the path. */
export function flightTrackSegments(points: FlightTrackPoint[]) {
  const segments: FlightTrackPoint[][] = [];
  let segment: FlightTrackPoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180 || flightAltitudeMetres(point) === null) {
      if (segment.length > 1) segments.push(segment);
      segment = []; continue;
    }
    const previous = segment.at(-1);
    if (previous) {
      const longitudeDelta = ((point.longitude - previous.longitude + 540) % 360) - 180;
      const steps = Math.min(40, Math.max(1, Math.ceil(Math.max(Math.abs(point.latitude - previous.latitude), Math.abs(longitudeDelta)) / .25)));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        segment.push({ latitude: previous.latitude + (point.latitude - previous.latitude) * t,
          longitude: ((previous.longitude + longitudeDelta * t + 540) % 360) - 180,
          altitudeFt: previous.altitudeFt! + (point.altitudeFt! - previous.altitudeFt!) * t });
      }
    }
    segment.push(point);
  }
  if (segment.length > 1) segments.push(segment);
  return segments;
}

/** Green departure/climb → cyan/blue → violet cruise; never changes flight height. */
export function flightAltitudeColor(feet: number): [number, number, number] {
  const stops = [[0, .3, .95, .15], [10000, .05, .8, .7], [20000, .15, .45, 1], [35000, .65, .15, 1], [50000, .95, .3, .85]];
  const value = Math.max(0, Math.min(50000, feet));
  const index = Math.min(stops.length - 2, stops.findIndex((s, i) => i < stops.length - 1 && value <= stops[i + 1][0]));
  const a = stops[index], b = stops[index + 1], t = (value - a[0]) / (b[0] - a[0]);
  return [1, 2, 3].map(i => a[i] + (b[i] - a[i]) * t) as [number, number, number];
}
