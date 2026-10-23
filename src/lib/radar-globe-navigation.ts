export type GlobeDragMode = "orbit" | "pan" | "look" | null;
const RAD = Math.PI / 180;
const wrap = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180;

export function globeDragMode(button: number, shift: boolean): GlobeDragMode {
  if (button === 2 || (shift && (button === 0 || button === 1))) return "look";
  return button === 1 ? "pan" : button === 0 ? "orbit" : null;
}

/** Great-circle translation avoids 1/cos(latitude) explosions at the poles. */
export function globePanPosition(latitude: number, longitude: number, eastKm: number, northKm: number) {
  const phi = latitude * RAD, lambda = longitude * RAD;
  const length = Math.hypot(eastKm, northKm);
  if (!length) return { latitude, longitude: wrap(longitude) };
  const angle = Math.min(Math.PI / 3, length / 6371);
  const east = eastKm / length, north = northKm / length;
  const x = Math.cos(phi) * Math.sin(lambda) * Math.cos(angle) + (Math.cos(lambda) * east - Math.sin(phi) * Math.sin(lambda) * north) * Math.sin(angle);
  const y = Math.sin(phi) * Math.cos(angle) + Math.cos(phi) * north * Math.sin(angle);
  const z = Math.cos(phi) * Math.cos(lambda) * Math.cos(angle) + (-Math.sin(lambda) * east - Math.sin(phi) * Math.cos(lambda) * north) * Math.sin(angle);
  return { latitude: Math.asin(Math.max(-1, Math.min(1, y))) / RAD, longitude: wrap(Math.atan2(x, z) / RAD) };
}

export function globePanDrag(dx: number, dy: number, altitudeKm: number, fov: number, viewportHeight: number, bearing: number, pitch: number) {
  const scale = Math.min(250, Math.max(0.001, altitudeKm * 2 * Math.tan(fov * RAD / 2) / Math.max(1, viewportHeight)));
  const right = -dx * scale, forward = dy * scale / Math.max(0.2, Math.abs(Math.cos(pitch * RAD)));
  return { eastKm: right * Math.cos(bearing * RAD) + forward * Math.sin(bearing * RAD), northKm: -right * Math.sin(bearing * RAD) + forward * Math.cos(bearing * RAD) };
}

export function globeLookDrag(bearing: number, pitch: number, dx: number, dy: number) {
  return { bearing: wrap(bearing + dx * 0.18), pitch: Math.max(0, Math.min(175, pitch - dy * 0.18)) };
}

/** Average-rate pacing works at 60/120/144 Hz without forcing 45 → 30 fps.
 * Stalls discard missed deadlines instead of creating a catch-up burst. */
export function nextGlobeFrame(now: number, deadline: number, fps: number) {
  const interval = 1000 / Math.max(1, fps);
  if (now + 0.05 < deadline) return null;
  const next = deadline + interval;
  return next <= now ? now + interval : next;
}
