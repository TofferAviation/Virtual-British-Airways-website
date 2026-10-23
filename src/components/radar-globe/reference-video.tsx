"use client";
import { useEffect, useRef, useState } from "react";

/** QA only: object URLs never upload the user's reference recording. */
export function LocalReferenceVideo() {
  const [source, setSource] = useState("");
  const [duration, setDuration] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);
  return <details style={{position:"absolute",right:12,top:116,zIndex:5,background:"#0a1929",padding:8,maxWidth:560}}>
    <summary>Local reference recording</summary>
    <p>Preview only on this device. No upload.</p>
    <input aria-label="Local reference video" type="file" accept="video/*" onChange={e=>{const file=e.target.files?.[0];if(file){setDuration(0);setSource(URL.createObjectURL(file));}}}/>
    {source?<>
      <video ref={video} src={source} controls style={{width:"100%",maxHeight:360}} onLoadedMetadata={e=>setDuration(e.currentTarget.duration)}/>
      <label>Reference time (seconds) <input aria-label="Reference time seconds" type="number" min={0} max={duration} step={1} defaultValue={0} onChange={e=>{if(video.current)video.current.currentTime=Math.max(0,Math.min(duration,Number(e.target.value)));}}/></label>
      <button onClick={()=>{if(video.current){if(video.current.paused)void video.current.play();else video.current.pause();}}}>Play / pause reference</button>
    </>:null}
  </details>;
}
