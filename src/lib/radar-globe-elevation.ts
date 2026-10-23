/** DEMs are metres above their source geoid, applied as visual relief over WGS84.
 * This is not a surveyed ellipsoidal-height / geoid-conversion service. */
export const ELEVATION_GRID = 65;
export const TERRAIN_CLEARANCE_KM = 0.005;
export function terrariumHeight(r: number, g: number, b: number) {
  return r * 256 + g + b / 256 - 32768;
}
export function mercatorPosition(latitude: number, longitude: number, level: number) {
  const n = 2 ** level, lat = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180;
  return { x: ((longitude + 180) / 360) * n, y: (1 - Math.asinh(Math.tan(lat)) / Math.PI) * n / 2 };
}
/** Matches the rendered a,c,b / b,c,d triangle topology, not a bilinear saddle. */
export function terrainHeight(grid: Float32Array, size: number, u: number, v: number) {
  const x = Math.max(0, Math.min(size - 1, u * (size - 1))), y = Math.max(0, Math.min(size - 1, v * (size - 1)));
  const col = Math.min(size - 2, Math.floor(x)), row = Math.min(size - 2, Math.floor(y));
  const dx = x - col, dy = y - row, a = grid[row * size + col], b = grid[row * size + col + 1], c = grid[(row + 1) * size + col], d = grid[(row + 1) * size + col + 1];
  return dx + dy <= 1 ? a + (b - a) * dx + (c - a) * dy : d + (c - d) * (1 - dx) + (b - d) * (1 - dy);
}
