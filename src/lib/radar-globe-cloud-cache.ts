/** Exact-view reuse, not temporal reprojection: any camera or density change
 * invalidates the image, so there is no history smearing over moving terrain. */
export class GlobeCloudCache {
  private signature = "";
  private expires = 0;
  private valid = false;
  refreshes = 0;
  hits = 0;
  shouldRefresh(signature: string, now: number, enabled = true) {
    const refresh = !enabled || !this.valid || signature !== this.signature || now >= this.expires;
    if (!refresh) this.hits++;
    return refresh;
  }
  commit(signature: string, now: number) {
    this.signature = signature; this.expires = now + 2000; this.valid = true; this.refreshes++;
  }
  invalidate() { this.valid = false; }
}

/** Always sample at least the regular settled profile on Low. Higher tiers
 * temporarily reduce only the cloud viewport, not ground resolution. */
export function movingCloudSize(width: number, height: number, moving: boolean, low: boolean) {
  const scale = moving && !low ? 0.72 : 1;
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
