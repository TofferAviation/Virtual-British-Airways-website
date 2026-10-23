"use client";

import { useEffect, useRef, useState } from "react";
import type { GlobeSceneState } from "@/components/radar-globe/scene";
export type { GlobeCamera } from "@/components/radar-globe/scene";

export function BaRadarThreeGlobe(props: GlobeSceneState) {
  const container = useRef<HTMLDivElement>(null),
    current = useRef(props);
  const [error, setError] = useState<string | null>(null);
  current.current = props;
  useEffect(() => {
    let disposed = false,
      cleanup: (() => void) | undefined;
    void import("@/components/radar-globe/scene").then(
      ({ createGlobeScene }) => {
        if (disposed || !container.current) return;
        try {
          cleanup = createGlobeScene(container.current, () => current.current);
        } catch (cause) {
          console.error("BA-Radar globe renderer failed", cause);
          setError(
            "The 3D globe could not start. Please use the 2D map or enable browser hardware acceleration.",
          );
        }
      },
    );
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  return (
    <div className="ba-radar-globe-map ba-radar-globe-three" ref={container}>
      <div className="ba-radar-globe-caption">
        <strong>Earth · WGS84</strong>
        <span>
          {error ?? "Drag to orbit · scroll to zoom · arrow keys to pan"}
        </span>
        <span>NASA GIBS / Blue Marble · NOAA GFS / SWPC</span>
      </div>
    </div>
  );
}
