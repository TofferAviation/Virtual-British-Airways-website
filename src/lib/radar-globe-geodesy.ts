/** WGS84, rendered in kilometres. Three axes: +Y north, +Z 0°E, +X 90°E. */
export const WGS84_A_KM = 6378.137;
export const WGS84_B_KM = 6356.752314245;
export const WGS84_E2 = 1 - (WGS84_B_KM / WGS84_A_KM) ** 2;
export type GlobeVector = [number, number, number];
const RAD = Math.PI / 180;

export function wrapLongitude(value: number) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

export function geodeticToWorld(
  latitude: number,
  longitude: number,
  heightMetres = 0,
): GlobeVector {
  const phi = latitude * RAD;
  const lambda = longitude * RAD;
  const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * Math.sin(phi) ** 2);
  const h = heightMetres / 1000;
  return [
    (n + h) * Math.cos(phi) * Math.sin(lambda),
    (n * (1 - WGS84_E2) + h) * Math.sin(phi),
    (n + h) * Math.cos(phi) * Math.cos(lambda),
  ];
}

export function worldToGeodetic([x, y, z]: GlobeVector) {
  const p = Math.hypot(x, z);
  if (p < 1e-9)
    return {
      latitude: y < 0 ? -90 : 90,
      longitude: 0,
      heightMetres: (Math.abs(y) - WGS84_B_KM) * 1000,
    };
  let phi = Math.atan2(y, p * (1 - WGS84_E2));
  let height = 0;
  for (let i = 0; i < 8; i += 1) {
    const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * Math.sin(phi) ** 2);
    height = p / Math.cos(phi) - n;
    phi = Math.atan2(y, p * (1 - (WGS84_E2 * n) / (n + height)));
  }
  return {
    latitude: phi / RAD,
    longitude: wrapLongitude(Math.atan2(x, z) / RAD),
    heightMetres: height * 1000,
  };
}

export function geodeticNormal(
  latitude: number,
  longitude: number,
): GlobeVector {
  const phi = latitude * RAD;
  const lambda = longitude * RAD;
  return [
    Math.cos(phi) * Math.sin(lambda),
    Math.sin(phi),
    Math.cos(phi) * Math.cos(lambda),
  ];
}

/** Low-order solar ephemeris, including equation of time; Earth-fixed vector. */
export function solarDirection(utc: Date): GlobeVector {
  const jd = utc.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = ((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) * RAD;
  const m = (357.52911 + t * (35999.05029 - 0.0001537 * t)) * RAD;
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    (Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
      Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
      Math.sin(3 * m) * 0.000289) *
    RAD;
  const omega = (125.04 - 1934.136 * t) * RAD;
  const apparentLongitude =
    l0 + c - (0.00569 + 0.00478 * Math.sin(omega)) * RAD;
  const obliquity =
    (23 +
      (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60 +
      0.00256 * Math.cos(omega)) *
    RAD;
  const declination = Math.asin(
    Math.sin(obliquity) * Math.sin(apparentLongitude),
  );
  const q = Math.tan(obliquity / 2) ** 2;
  const equationMinutes =
    (4 / RAD) *
    (q * Math.sin(2 * l0) -
      2 * eccentricity * Math.sin(m) +
      4 * eccentricity * q * Math.sin(m) * Math.cos(2 * l0) -
      0.5 * q * q * Math.sin(4 * l0) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * m));
  const minutes =
    utc.getUTCHours() * 60 + utc.getUTCMinutes() + utc.getUTCSeconds() / 60;
  return geodeticNormal(
    declination / RAD,
    wrapLongitude((720 - minutes - equationMinutes) / 4),
  );
}

/** Geographic quadtree: two square roots, one for each 180° hemisphere. */
export function geographicTileBounds(
  level: number,
  column: number,
  row: number,
) {
  const span = 180 / 2 ** level;
  return {
    west: -180 + column * span,
    east: -180 + (column + 1) * span,
    north: 90 - row * span,
    south: 90 - (row + 1) * span,
  };
}

/** Keep a useful depth interval without clipping a surface-level camera. */
export function globeClipRange(distanceKm: number) {
  const height = Math.max(0, distanceKm - WGS84_A_KM);
  return {
    near: Math.max(0.0002, height * 0.25),
    far: distanceKm + WGS84_A_KM + 500,
  };
}

/** Wheel modes are pixels, lines or pages; clamp spikes before exponentiation. */
export function globeZoomTarget(
  distanceKm: number,
  delta: number,
  mode: number,
  viewportHeight: number,
  terrainKm = 0,
) {
  const pixels = Math.max(
    -160,
    Math.min(160, delta * (mode === 1 ? 16 : mode === 2 ? viewportHeight : 1)),
  );
  return (
    WGS84_A_KM +
    Math.min(40000,terrainKm+Math.max(0.005, (distanceKm - WGS84_A_KM-terrainKm) * Math.exp(pixels * 0.0012)))
  );
}

/** Exponential damping is independent of display refresh rate. */
export function globeZoomStep(current: number, target: number, seconds: number) {
  return current + (target - current) * (1 - Math.exp(-Math.max(0, seconds) * 14));
}
