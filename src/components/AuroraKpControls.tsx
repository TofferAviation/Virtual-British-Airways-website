"use client";
import {auroraKpOverride,type AuroraKpSettings} from "@/lib/radar-aurora-kp";

export function AuroraKpControls({settings,onChange}:{settings:AuroraKpSettings;onChange:(value:AuroraKpSettings)=>void}) {
  const kp=auroraKpOverride(settings);
  return <div aria-label="Manual Kp simulation controls" style={{display:"grid",gap:8,fontSize:12,border:"1px solid #35516c",padding:9}}>
    <label style={{display:"flex",alignItems:"center",gap:6,font:"inherit",textTransform:"none",letterSpacing:0}}>
      <input aria-label="Manual Kp override" style={{gridColumn:"auto",width:14,height:14,flexShrink:0}} type="checkbox" checked={kp!==null} onChange={e=>onChange({...settings,kpOverrideEnabled:e.target.checked})}/>
      Manual Kp simulation
    </label>
    <label style={{display:"grid",gridTemplateColumns:"1fr",font:"inherit",textTransform:"none",letterSpacing:0,gap:4}}>Kp value
      <select aria-label="Manual Kp value" disabled={kp===null} value={kp??settings.kpOverride??5} onChange={e=>onChange({...settings,kpOverride:Number(e.target.value)})} style={{width:"100%",padding:5,color:"#163248",background:"#f8fbfe"}}>
        {Array.from({length:10},(_,n)=><option key={n} value={n}>{n}{n>=5?` · G${n-4}`:""}</option>)}
      </select>
    </label>
    <small>{kp!==null?`SIMULATION · Kp ${kp} — not live NOAA. Approximate oval extent and brightness; not a viewing forecast.`:"Live NOAA field. Enable to preview an illustrative Kp 0–9 oval in both hemispheres."} Source changes blend over 12 seconds.</small>
    {kp!==null?<button type="button" onClick={()=>onChange({...settings,kpOverrideEnabled:false})}>Return to live NOAA</button>:null}
  </div>;
}
