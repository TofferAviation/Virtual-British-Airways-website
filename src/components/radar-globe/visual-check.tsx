"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { BaRadarThreeGlobe } from "@/components/BaRadarThreeGlobe";
import type { RadarCloudData, RadarAuroraData } from "@/lib/radar-external";
import type { GlobeQualityRequest } from "@/lib/radar-globe-quality";
import type { AuroraSettings } from "@/components/BaRadarAuroraLayer";

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
  terrain: {
    latitude: 51.5,
    longitude: -0.12,
    distanceKm: 6390.137,
    pitch: 30,
    fov: 55,
    date: "2026-03-20T12:00:00Z",
  },
  mountains: { latitude:46.57, longitude:7.98, distanceKm:6387.237, pitch:86, bearing:190, fov:60, date:"2026-03-20T10:00:00Z" },
  ground: { latitude:69.65, longitude:18.96, distanceKm:6378.142, pitch:100, bearing:0, fov:65, date:"2026-03-20T22:00:00Z" },
  norway: { latitude:67, longitude:20, distanceKm:6878.137, pitch:85, bearing:0, fov:60, date:"2026-03-20T22:00:00Z" },
  aurora: {latitude:58,longitude:71,distanceKm:6878.137,pitch:68,bearing:0,fov:60,date:"2026-03-20T22:00:00Z"},
  curtains: {latitude:64.55,longitude:115.8,distanceKm:6526.983,pitch:91,bearing:28.4,fov:65,date:"2026-03-20T11:00:00Z"},
  rays: {latitude:64.55,longitude:115.8,distanceKm:6388.242,pitch:108,bearing:28.4,fov:65,date:"2026-03-20T11:00:00Z"},
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
    [quality, setQuality] = useState<GlobeQualityRequest>("auto"),
    [cache, setCache] = useState(true),
    [motion, setMotion] = useState(false),
    [auroraDebug,setAuroraDebug]=useState<AuroraSettings["debug"]>("off"),
    [hemisphere,setHemisphere]=useState<AuroraSettings["hemisphere"]>("both"),
    [auroraCase,setAuroraCase]=useState("live"),
    [paused,setPaused]=useState(false),
    [recording,setRecording]=useState(false),
    [captureSeconds,setCaptureSeconds]=useState(6),
    [captureUrl,setCaptureUrl]=useState(""),
    [errors, setErrors] = useState<string[]>([]),
    [diagnostics, setDiagnostics] = useState("");
  const recordingRef=useRef<{recorder:MediaRecorder;stream:MediaStream;timer:ReturnType<typeof setTimeout>}|null>(null),captureRef=useRef("");
  useEffect(()=>()=>{const active=recordingRef.current;if(active){clearTimeout(active.timer);if(active.recorder.state!=="inactive")active.recorder.stop();active.stream.getTracks().forEach(t=>t.stop());}if(captureRef.current)URL.revokeObjectURL(captureRef.current);},[]);
  const record=()=>{
    const canvas=document.querySelector<HTMLCanvasElement>(".ba-radar-globe-three-canvas");
    if(!canvas||!canvas.captureStream||typeof MediaRecorder==="undefined"){setErrors(v=>[...v,"This browser does not support canvas recording"]);return;}
    try{
      const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream),chunks:BlobPart[]=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(captureRef.current)URL.revokeObjectURL(captureRef.current);captureRef.current=URL.createObjectURL(new Blob(chunks,{type:recorder.mimeType}));setCaptureUrl(captureRef.current);setRecording(false);recordingRef.current=null;};
      recorder.start();setRecording(true);const timer=setTimeout(()=>{if(recorder.state!=="inactive")recorder.stop();},captureSeconds*1000);recordingRef.current={stream,recorder,timer};
    }catch(e){setErrors(v=>[...v,String(e)]);}
  };
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
    const refreshAurora=()=>void fetch("/api/radar/aurora").then(r=>r.json()).then(setAurora).catch(()=>{});
    refreshAurora();const auroraTimer=setInterval(refreshAurora,300000);
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
      clearInterval(auroraTimer);
      window.removeEventListener("globe-shader-error", handler);
    };
  }, []);
  const displayAurora=useMemo(()=>{
    if(auroraCase==="live")return aurora;
    const shifted=auroraCase==="shift", minute=auroraCase==="quiet"?0:shifted?2:1;
    const samples=Array.from({length:65160},(_,i)=>{
      const longitude=Math.floor(i/181),latitude=i%181-90,p=longitude*Math.PI/180;
      const north=67+5*Math.sin(p+0.3)+(shifted?2:0),south=-69+3*Math.cos(p-1.8)-(shifted?1:0);
      const distance=Math.min(Math.abs(latitude-north),Math.abs(latitude-south));
      const probability=Math.round((auroraCase==="quiet"?9:83)*Math.exp(-distance*distance/8)*(0.55+0.45*Math.sin(p*1.5)**2));
      return {longitude,latitude,probability};
    });
    return {source:"NOAA SWPC OVATION Prime" as const,observedAt:`2026-03-20T22:0${minute}:00Z`,forecastAt:`2026-03-20T22:3${minute}:00Z`,refreshedAt:"2026-03-20T22:00:00Z",samples};
  },[aurora,auroraCase]);
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
      <div style={{ position: "absolute", inset: "112px 0 88px" }}>
        <BaRadarThreeGlobe
          key={`${view}-${revision}`}
          flights={[]}
          selectedId=""
          onSelect={() => {}}
          controllers={[]}
          onSelectController={() => {}}
          replay={null}
          auroraEnabled
          aurora={displayAurora}
          auroraSettings={{
            activity: 1,
            animationSpeed: paused?0:1,
            brightness: 1,
            quality: "high",
            enhancedPresentation: false,
            hemisphere,debug:auroraDebug,
          }}
          cloudsEnabled={clouds}
          cloudData={data}
          cloudSettings={{
            realWorld: true,
            opacity: 0.65,
            quality,
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
          testCloudCache={cache}
          testCameraMotion={motion}
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
        <label style={{fontSize: 12}}>Globe quality {" "}<select aria-label="Globe quality" value={quality} onChange={e => setQuality(e.target.value as GlobeQualityRequest)}>{["auto", "low", "medium", "high", "ultra"].map(q => <option key={q} value={q}>{q}</option>)}</select></label>
        <label style={{fontSize: 12}}><input type="checkbox" checked={cache} onChange={e => setCache(e.target.checked)} />Cloud cache</label>
        <label style={{fontSize: 12}}><input type="checkbox" checked={motion} onChange={e => setMotion(e.target.checked)} />Motion test</label>
        <label>Aurora view <select aria-label="Aurora view" value={auroraDebug} onChange={e=>setAuroraDebug(e.target.value as AuroraSettings["debug"])}><option value="off">Curtains</option><option value="field">NOAA heatmap</option><option value="altitude">Altitude 95–450 km</option></select></label>
        <label>Hemisphere <select aria-label="Aurora hemisphere" value={hemisphere} onChange={e=>setHemisphere(e.target.value as AuroraSettings["hemisphere"])}><option value="both">Both</option><option value="north">North</option><option value="south">South</option></select></label>
        <label>Forecast <select aria-label="Aurora test forecast" value={auroraCase} onChange={e=>setAuroraCase(e.target.value)}><option value="live">Live NOAA</option><option value="quiet">Synthetic quiet</option><option value="storm">Synthetic active</option><option value="shift">Synthetic shifted · transition</option></select></label>
        <label><input type="checkbox" checked={paused} onChange={e=>setPaused(e.target.checked)}/>Pause aurora</label>
        <select aria-label="Capture length" value={captureSeconds} onChange={e=>setCaptureSeconds(Number(e.target.value))} disabled={recording}><option value={6}>6 s</option><option value={12}>12 s</option><option value={20}>20 s</option></select>
        <button onClick={record} disabled={recording}>{recording?"Recording…":`Record ${captureSeconds} s`}</button>
        {captureUrl?<a href={captureUrl} download={`globe-${view}-${auroraCase}.webm`} style={{color:"#94d4ff"}}>Save orbital capture</a>:null}
        <span style={{flexBasis: "100%", fontSize: 11, color: view === "cumulus" ? "#ffce74" : "#9ab7ce"}}>
          {auroraCase!=="live"?`SYNTHETIC AURORA ${auroraCase.toUpperCase()} — NOT LIVE NOAA · `:""}{view === "cumulus" ? "SYNTHETIC CUMULUS CALIBRATION — not live weather" : `GFS: ${data?.validAt ?? "loading"} · NOAA valid: ${displayAurora?.forecastAt ?? "loading"}`} · fixed test Sun: {selected.date}
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
