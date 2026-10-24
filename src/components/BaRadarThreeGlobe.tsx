"use client";

import { useEffect, useRef, useState } from "react";
import type { GlobeSceneState } from "@/components/radar-globe/scene";
import { auroraKpOverride } from "@/lib/radar-aurora-kp";
import { DEFAULT_AIRCRAFT_CLOSE_SCALE, resolveAircraftModel } from "@/lib/radar-aircraft";
export type { GlobeCamera } from "@/components/radar-globe/scene";

export function BaRadarThreeGlobe(props: GlobeSceneState & { compactControls?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [aircraftCloseScale,setAircraftCloseScale]=useState(props.aircraftCloseScale??DEFAULT_AIRCRAFT_CLOSE_SCALE);
  const [contrailsEnabled,setContrailsEnabled]=useState(props.contrailsEnabled??true);
  const current = useRef({...props,aircraftCloseScale,contrailsEnabled});
  const [error, setError] = useState<string | null>(null);
  const [performanceLabel, setPerformanceLabel] = useState("Loading globe assets…");
  const [cloudCoverageLabel,setCloudCoverageLabel]=useState("Cloud coverage below camera: unknown (not clear)");
  const [cameraFollow,setCameraFollow]=useState({id:"",message:""});
  const selectedFlight=props.flights.find(f=>f.id===props.selectedId);
  const aircraftName=props.replay?.aircraft??selectedFlight?.aircraft;
  const aircraftModel=aircraftName?resolveAircraftModel(aircraftName):null;
  useEffect(() => {
    current.current = {...props,aircraftCloseScale,contrailsEnabled};
  }, [props,aircraftCloseScale,contrailsEnabled]);
  useEffect(() => {
    let disposed = false,
      cleanup: (() => void) | undefined;
    const host=container.current;
    const onFollowChange=(event:Event)=>setCameraFollow((event as CustomEvent<{id:string;message:string}>).detail);
    host?.addEventListener("globe-follow-change",onFollowChange);
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
      setCloudCoverageLabel(`Cloud coverage below camera: ${info.cloudBelowCamera??"unknown"}${info.cloudBelowCamera==="unknown"?" (not clear; no generated fill)":""}`);
      setPerformanceLabel(`${info.mode === "auto" ? "Auto → " : ""}${info.quality} · ${info.fps} fps · LOD ${info.terrain.level} · ${info.aboveGroundMetres.toLocaleString()} m AGL${info.waitingForTerrain ? " · loading terrain / descent held safely" : ""}`);
    }, 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
      host?.removeEventListener("globe-follow-change",onFollowChange);
      cleanup?.();
    };
  }, []);
  return (
    <div className="ba-radar-globe-map ba-radar-globe-three" ref={container}>
      <div className="ba-radar-globe-caption">
        <strong>Earth · WGS84</strong>
        {aircraftName?<><span>{aircraftModel?`${aircraftModel.label}${aircraftModel.match==="family"?" · family substitute":""} · house livery`:`${aircraftName} · generic aircraft marker`}</span><button type="button" style={{pointerEvents:"auto",font:"10px Arial",padding:"4px 7px",color:"#d7ebff",background:"#12344b",border:"1px solid #4982a6",borderRadius:3}} onClick={()=>container.current?.querySelector("canvas")?.dispatchEvent(new Event("globe-aircraft-view"))}>View aircraft · reported altitude</button></>:null}
        {selectedFlight&&!props.replay?<button type="button" aria-pressed={cameraFollow.id===selectedFlight.id} disabled={!selectedFlight.lastSnapshot} title="Travel with this aircraft's smoothed 3D position. Pan, look and zoom remain available; Escape stops following." style={{pointerEvents:"auto",font:"10px Arial",padding:"4px 7px",color:"#d7ebff",background:cameraFollow.id===selectedFlight.id?"#215e77":"#12344b",border:"1px solid #4982a6",borderRadius:3}} onClick={()=>{
          const canvas=container.current?.querySelector("canvas");canvas?.dispatchEvent(new Event("globe-aircraft-follow"));canvas?.focus({preventScroll:true});
        }}>{cameraFollow.id===selectedFlight.id?"Stop following":"Follow aircraft"}</button>:null}
        <span role="status" aria-live="polite">{cameraFollow.id===selectedFlight?.id?`Following ${selectedFlight.callsign} · camera follow`:cameraFollow.message}</span>
        {aircraftModel?<label style={{pointerEvents:"auto",display:"flex",alignItems:"center",gap:7,font:"10px Arial"}} title="Visual size of the selected aircraft nearby. 100% restores true size close up; reported position and altitude never change.">Close-up size <input type="range" aria-label="Selected aircraft close-up size" min={100} max={250} step={25} value={Math.round(aircraftCloseScale*100)} style={{width:90}} onChange={event=>setAircraftCloseScale(Number(event.target.value)/100)} /><output>{Math.round(aircraftCloseScale*100)}%</output></label>:null}
        <label style={{pointerEvents:"auto",display:"flex",alignItems:"center",gap:5,font:"10px Arial"}} title="Cosmetic engine trails on moving cruise-altitude aircraft. Not weather-dependent or observed contrails."><input aria-label="Simulated contrails" type="checkbox" checked={contrailsEnabled} onChange={event=>setContrailsEnabled(event.target.checked)}/>Contrails · visual effect</label>
        {props.cloudsEnabled?<span>{cloudCoverageLabel}</span>:null}
        {props.cloudsEnabled&&!props.testCloudProfile?<span style={{color:"#eacb8a"}}>{props.cloudSettings.coverageMode==="forecast"?"GLOBAL FORECAST · modelled clouds, not satellite observed":"Reconstructed cloud edges · uncertainty band ≤10 km"}</span>:null}
        {props.auroraEnabled&&auroraKpOverride(props.auroraSettings)!==null?<strong style={{color:"#ffcf83"}}>SIMULATION · manual Kp {auroraKpOverride(props.auroraSettings)} · not live NOAA</strong>:null}
        <details className="ba-radar-globe-help" open={!props.compactControls}>
        <summary>Camera controls &amp; sources</summary>
        <div className="ba-radar-globe-help-body">
        <span>
          {error ?? "Left-drag: orbit · Middle-drag: pan · Right / Shift+middle: look · Wheel: zoom"}
        </span>
        <span>WASD: move · Q/E: down/up · Shift: faster · Home: reset view · Escape: stop following</span>
        <span>NASA GIBS · Blue Marble / Landsat (historical) · NOAA ABI / GFS winds / SWPC</span>
        <span>Aircraft: type-matched 3D airframes at every zoom; enlarged at map scale, adjustable close-up size for the selected aircraft. 100% restores true size nearby. Motion interpolates reported positions, headings and heights with a 15 s playback buffer; holds at the last report if updates stop. Recorded tracks and flight details remain unmodified. Track colour: green low → violet high.</span>
        <a href="/globe-sources" target="_blank" rel="noreferrer" style={{pointerEvents:"auto",color:"#a8c6d9"}}>Aircraft / terrain: authors, sources, licences &amp; limits</a>
        <button type="button" style={{ pointerEvents: "auto", justifySelf: "start", font: "10px Arial", padding: "4px 7px", color: "#d7ebff", background: "#12344b", border: "1px solid #4982a6", borderRadius: 3 }} onClick={() => {
          const canvas = container.current?.querySelector("canvas");
          canvas?.dispatchEvent(new Event("globe-reset-view"));
          canvas?.focus({ preventScroll: true });
        }}>Reset view</button>
        <button type="button" style={{pointerEvents:"auto",font:"10px Arial",padding:"4px 7px",color:"#d7ebff",background:"#12344b",border:"1px solid #4982a6",borderRadius:3}} onClick={()=>{
          const canvas=container.current?.querySelector("canvas"); canvas?.dispatchEvent(new Event("globe-ground-view")); canvas?.focus({preventScroll:true});
        }}>Go to ground · 5 m</button>
        </div>
        </details>
        <span aria-live="off">{error ?? performanceLabel}</span>
      </div>
    </div>
  );
}
