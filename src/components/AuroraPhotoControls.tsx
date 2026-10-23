"use client";
import { DEFAULT_AURORA_COLOURS, resetAuroraPhoto, type AuroraColour, type AuroraPhotoSettings } from "@/lib/radar-aurora-photo";

const channels:{key:AuroraColour;label:string;colour:string}[]=[
  {key:"green",label:"Green oxygen",colour:"#6de98a"},
  {key:"red",label:"Red oxygen",colour:"#fa787c"},
  {key:"violet",label:"Violet / pink nitrogen",colour:"#dd9af8"},
  {key:"blue",label:"Blue nitrogen",colour:"#86b4ff"},
];
/** Colour controls only: never writes motion, shape, exposure or camera state. */
export function AuroraPhotoControls({settings,onChange}:{settings:AuroraPhotoSettings;onChange:(value:AuroraPhotoSettings)=>void}) {
  const labelStyle={display:"grid",gridTemplateColumns:"1fr",gap:4,font:"inherit",letterSpacing:0,textTransform:"none" as const};
  return <div aria-label="Aurora screenshot colour controls" style={{display:"grid",gap:10,fontSize:12}}>
    <label style={{...labelStyle,display:"flex",alignItems:"center",gap:6}}>
      <input aria-label="Screenshot colour override" type="checkbox" style={{gridColumn:"auto",width:14,height:14,flexShrink:0}} checked={settings.photoMode??false} onChange={e=>onChange({...settings,photoMode:e.target.checked})}/>
      Screenshot colour override
    </label>
    <fieldset disabled={!settings.photoMode} style={{display:"grid",gap:8,border:"1px solid #35516c",padding:10,margin:0,opacity:settings.photoMode?1:.55}}>
      <legend>Emission strength</legend>
      {channels.map(({key,label,colour})=><label key={key} style={{...labelStyle,color:colour}}>{label} · {Math.round((settings.colourGains?.[key]??1)*100)}%
        <input aria-label={label} type="range" min={0} max={4} step={.05} value={settings.colourGains?.[key]??1} onChange={e=>onChange({...settings,colourGains:{...DEFAULT_AURORA_COLOURS,...settings.colourGains,[key]:Number(e.target.value)}})}/>
      </label>)}
    </fieldset>
    <small>{settings.photoMode?"SCREENSHOT OVERRIDE — artistic colour strengths, not measured NOAA colours.":"Original palette unchanged. Enable the override for screenshot colours."} Red stays high; nitrogen stays near the lower border. Colour sliders never change the activity field.</small>
    <button type="button" onClick={()=>onChange(resetAuroraPhoto(settings))}>Reset screenshot colours</button>
  </div>;
}
