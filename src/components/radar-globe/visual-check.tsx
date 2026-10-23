"use client";
import { useEffect, useState } from "react";
import { BaRadarThreeGlobe } from "@/components/BaRadarThreeGlobe";
import type { RadarCloudData, RadarAuroraData } from "@/lib/radar-external";

const views = {
  day: {
    latitude: 25,
    longitude: 15,
    distanceKm: 22000,
    date: "2026-03-20T11:00:00Z",
  },
  north: {
    latitude: 90,
    longitude: 0,
    distanceKm: 18000,
    date: "2026-03-20T12:00:00Z",
  },
  south: {
    latitude: -90,
    longitude: 0,
    distanceKm: 18000,
    date: "2026-03-20T12:00:00Z",
  },
  night: {
    latitude: 58,
    longitude: 10,
    distanceKm: 19000,
    date: "2026-03-20T00:00:00Z",
  },
  clouds: {
    latitude: 46,
    longitude: -28,
    distanceKm: 9000,
    date: "2026-03-20T14:00:00Z",
  },
  close: {
    latitude: 42,
    longitude: -20,
    distanceKm: 6778,
    pitch: 55,
    date: "2026-03-20T18:00:00Z",
  },
  flight: {
    latitude: 46,
    longitude: 0,
    distanceKm: 6382.637,
    pitch: 78,
    fov: 58,
    date: "2026-03-20T14:30:00Z",
  },
  cumulus: {
    latitude: 46,
    longitude: 0,
    distanceKm: 6384.637,
    pitch: 76,
    fov: 62,
    date: "2026-03-20T14:30:00Z",
  },
  limb: {
    latitude: 10,
    longitude: 90,
    distanceKm: 18000,
    date: "2026-03-20T12:00:00Z",
  },
};
export function GlobeVisualCheck() {
  const [view, setView] = useState<keyof typeof views>("day"),
    [revision, setRevision] = useState(0),
    [data, setData] = useState<RadarCloudData | null>(null),
    [aurora, setAurora] = useState<RadarAuroraData | null>(null),
    [clouds, setClouds] = useState(true),
    [errors, setErrors] = useState<string[]>([]),
    [diagnostics, setDiagnostics] = useState("");
  useEffect(() => {
    void fetch("/api/radar/clouds")
      .then((r) => r.json())
      .then(async (data: RadarCloudData) => {
        if (data.encoding === "rgba8-gzip-base64")
          for (const layer of data.layers) {
            const bytes = Uint8Array.from(atob(layer.volume), (c) =>
              c.charCodeAt(0),
            );
            const unpacked = new Uint8Array(
              await new Response(
                new Blob([bytes])
                  .stream()
                  .pipeThrough(new DecompressionStream("gzip")),
              ).arrayBuffer(),
            );
            let result = "";
            for (let i = 0; i < unpacked.length; i += 32768)
              result += String.fromCharCode(...unpacked.subarray(i, i + 32768));
            layer.volume = btoa(result);
          }
        setData({ ...data, encoding: "rgba8-base64" });
      })
      .catch((e) => setErrors((v) => [...v, String(e)]));
    void fetch("/api/radar/aurora")
      .then((r) => r.json())
      .then(setAurora);
    const handler = (event: Event) =>
      setErrors((v) => [...v, (event as CustomEvent<string>).detail]);
    window.addEventListener("globe-shader-error", handler);
    const timer = setInterval(
      () =>
        setDiagnostics(
          document.querySelector<HTMLElement>("[data-globe-diagnostics]")
            ?.dataset.globeDiagnostics ?? "",
        ),
      1000,
    );
    return () => {
      clearInterval(timer);
      window.removeEventListener("globe-shader-error", handler);
    };
  }, []);
  const selected = views[view];
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        background: "#01040a",
        color: "#d3e4f3",
        font: "13px Arial",
      }}
    >
      <div style={{ position: "absolute", inset: "78px 0 48px" }}>
        <BaRadarThreeGlobe
          key={`${view}-${revision}`}
          flights={[]}
          selectedId=""
          onSelect={() => {}}
          controllers={[]}
          onSelectController={() => {}}
          replay={null}
          auroraEnabled
          aurora={aurora}
          auroraSettings={{
            activity: 1,
            animationSpeed: 1,
            brightness: 1,
            quality: "high",
            enhancedPresentation: false,
          }}
          cloudsEnabled={clouds}
          cloudData={data}
          cloudSettings={{
            realWorld: true,
            opacity: 0.65,
            quality: "high",
            low: true,
            middle: true,
            high: true,
            selfShadows: true,
            enhancedPresentation: false,
            debugMode: "lit",
          }}
          dayNightEnabled
          initialCamera={null}
          onCameraChange={() => {}}
          testDate={selected.date}
          testView={selected}
          testCloudProfile={view === "cumulus" ? { coverage: 0.58, baseKm: 1.2, topKm: 5 } : undefined}
        />
      </div>
      <nav
        style={{ position: "relative", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: 10 }}
      >
        <strong>Globe visual check</strong>
        {Object.keys(views).map((name) => (
          <button
            key={name}
            style={{ font: "12px Arial", padding: "5px 9px", color: "white", border: "1px solid #3f5e79", borderRadius: 3, background: view === name ? "#12639c" : "#10283c" }}
            onClick={() => {
              setView(name as keyof typeof views);
              setRevision((value) => value + 1);
            }}
          >
            {name}
          </button>
        ))}
        <button style={{font: "12px Arial", padding: "5px 9px"}} onClick={() => setClouds((v) => !v)}>
          Clouds {clouds ? "on" : "off"}
        </button>
        <span style={{flexBasis: "100%", fontSize: 11, color: view === "cumulus" ? "#ffce74" : "#9ab7ce"}}>
          {view === "cumulus" ? "SYNTHETIC CUMULUS CALIBRATION — not live weather" : `GFS forecast: ${data?.validAt ?? "loading"} · NOAA: ${aurora?.forecastAt ?? "loading"}`} · fixed test Sun: {selected.date}
        </span>
      </nav>
      <output
        style={{
          position: "absolute",
          bottom: 8,
          left: 12,
          right: 12,
          whiteSpace: "pre-wrap",
          fontSize: 10,
        }}
      >
        {errors.length
          ? errors.join("\n")
          : diagnostics || "Initialising renderer…"}
      </output>
    </main>
  );
}
