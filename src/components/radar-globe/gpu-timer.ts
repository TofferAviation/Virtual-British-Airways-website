/** Non-blocking GPU timings. Never gl.finish/readPixels or a synchronous wait. */
export class GlobeGpuTimer {
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private pending: Array<{ query: WebGLQuery; tag: string }> = [];
  private active: WebGLQuery | null = null;
  private tag = "frame";
  private gl: WebGL2RenderingContext;
  latestMs: number | null = null;
  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  }
  begin(tag = "frame") {
    if (!this.ext || this.pending.length >= 4 || this.gl.isContextLost()) return;
    this.active = this.gl.createQuery();
    this.tag = tag;
    if (this.active) this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active);
  }
  end() {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push({ query: this.active, tag: this.tag }); this.active = null;
  }
  poll() {
    if (!this.ext || this.gl.isContextLost()) return null;
    if (this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
      this.pending.forEach(q => this.gl.deleteQuery(q.query)); this.pending = []; this.latestMs = null;
      return null;
    }
    const item = this.pending[0];
    if (!item || !this.gl.getQueryParameter(item.query, this.gl.QUERY_RESULT_AVAILABLE)) return null;
    const ms = this.gl.getQueryParameter(item.query, this.gl.QUERY_RESULT) / 1e6;
    this.gl.deleteQuery(item.query); this.pending.shift(); this.latestMs = ms;
    return { ms, tag: item.tag };
  }
  dispose() {
    this.pending.forEach(q => this.gl.deleteQuery(q.query)); this.pending = [];
    this.active = null; this.latestMs = null;
  }
}
