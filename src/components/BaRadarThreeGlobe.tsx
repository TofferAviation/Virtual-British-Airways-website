"use client";

import { useEffect, useRef, useState } from "react";
import type { GlobeSceneState } from "@/components/radar-globe/scene";
export type { GlobeCamera } from "@/components/radar-globe/scene";

export function BaRadarThreeGlobe(props: GlobeSceneState) {
  const container = useRef<HTMLDivElement>(null),
    current = useRef(props);
  const [error, setError] = useState<string | null>(null);
  const [performanceLabel, setPerformanceLabel] = useState("Loading globe assets…");
  useEffect(() => {
    current.current = props;
  }, [props]);
  useEffect(() => {
    let disposed = false,
      cleanup: (() => void) | undefined;
    void Promise.all([import("@/components/radar-globe/scene"), import("@/components/radar-globe/noise")]).then(
      async ([{ createGlobeScene }, { cloudNoiseTexture }]) => {
        const textures = await Promise.all([cloudNoiseTexture(), cloudNoiseTexture(true)]);
        if (disposed || !container.current) { textures.forEach(t => t.dispose()); return; }
        try {
          cleanup = createGlobeScene(container.current, () => current.current, textures);
        } catch (cause) {
          textures.forEach(t => t.dispose());
          console.error("BA-Radar globe renderer failed", cause);
          setError(
            "The 3D globe could not start. Please use the 2D map or enable browser hardware acceleration.",
          );
        }
      },
    ).catch(cause => { console.error("Globe assets failed", cause); if (!disposed) setError("Globe assets could not load. Please reload or use the 2D map."); });
    const timer = setInterval(() => {
      const host = container.current;
      if (host?.dataset.globeStatus) { setPerformanceLabel(host.dataset.globeStatus); return; }
      if (!host?.dataset.globeDiagnostics) return;
      const info = JSON.parse(host.dataset.globeDiagnostics);
      setPerformanceLabel(`${info.mode === "auto" ? "Auto → " : ""}${info.quality} · ${info.fps} fps · ground LOD ${info.terrain.level}`);
    }, 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
      cleanup?.();
    };
  }, []);
  return (
    <div className="ba-radar-globe-map ba-radar-globe-three" ref={container}>
      <div className="ba-radar-globe-caption">
        <strong>Earth · WGS84</strong>
        <span>
          {error ?? "Drag to orbit · scroll to zoom · Shift-drag to tilt"}
        </span>
        <span>NASA GIBS · Blue Marble / Landsat (historical) · NOAA GFS / SWPC</span>
        <span aria-live="off">{error ? "3D unavailable" : performanceLabel}</span>
      </div>
    </div>
  );
}
