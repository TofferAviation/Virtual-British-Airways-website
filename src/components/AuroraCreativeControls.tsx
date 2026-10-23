"use client";
import { auroraAppearance, resetAuroraAppearance, type AuroraColour, type AuroraSettings } from "@/lib/radar-aurora-settings";

const colours: {key:AuroraColour;label:string;colour:string}[] = [
  {key:"green",label:"Green oxygen",colour:"#6de98a"},
  {key:"red",label:"Red oxygen",colour:"#fa787c"},
  {key:"violet",label:"Violet / pink nitrogen",colour:"#dd9af8"},
  {key:"blue",label:"Blue nitrogen",colour:"#86b4ff"},
];
/** Shared by the live desktop/mobile layer panel and the dev visual check. */
export function AuroraCreativeControls({settings,onChange}:{settings:AuroraSettings;onChange:(value:AuroraSettings)=>void}) {
  const appearance=auroraAppearance(settings);
  const sliderLabel={display:"grid",gridTemplateColumns:"1fr",gap:4,font:"inherit",letterSpacing:0,textTransform:"none" as const};
  return <div aria-label="Aurora motion and screenshot controls" style={{display:"grid",gap:10,fontSize:12}}>
    <label style={sliderLabel}>Motion speed · {Math.round(appearance.speed*100)}%
      <input aria-label="Aurora motion speed" type="range" min={0} max={1.8} step={.01} value={appearance.speed} onChange={e=>onChange({...settings,animationSpeed:Number(e.target.value)})}/>
    </label>
    <label style={sliderLabel}>Height-layer swirl · {Math.round(appearance.vortex*100)}%
      <input aria-label="Aurora height-layer swirl" type="range" min={0} max={1.5} step={.05} value={appearance.vortex} onChange={e=>onChange({...settings,vortexStrength:Number(e.target.value)})}/>
    </label>
    <label style={sliderLabel}>Brightness · {Math.round(settings.brightness*100)}%
      <input aria-label="Aurora brightness" type="range" min={.45} max={1.65} step={.05} value={settings.brightness} onChange={e=>onChange({...settings,brightness:Number(e.target.value)})}/>
    </label>
    <label style={{...sliderLabel,display:"flex",alignItems:"center",gap:6}}><input style={{gridColumn:"auto",width:14,height:14,flexShrink:0}} aria-label="Screenshot colour override" type="checkbox" checked={settings.photoMode??false} onChange={e=>onChange({...settings,photoMode:e.target.checked})}/> Screenshot colour override</label>
    <fieldset disabled={!settings.photoMode} style={{display:"grid",gap:8,border:"1px solid #35516c",padding:10,margin:0,opacity:settings.photoMode?1:.55}}>
      <legend>Emission strength</legend>
      {colours.map(({key,label,colour})=><label key={key} style={{...sliderLabel,color:colour}}>{label} · {Math.round((settings.colourGains?.[key]??1)*100)}%
        <input aria-label={label} type="range" min={0} max={4} step={.05} value={settings.colourGains?.[key]??1} onChange={e=>onChange({...settings,colourGains:{green:1,red:1,violet:1,blue:1,...settings.colourGains,[key]:Number(e.target.value)}})}/>
      </label>)}
    </fieldset>
    <small>{settings.photoMode?"SCREENSHOT OVERRIDE — artistic colour strengths, not measured NOAA colours.":"Natural palette. Enable the override to adjust colours for screenshots."} Red stays high; nitrogen stays near the lower border. NOAA coverage is unchanged.</small>
    <button type="button" onClick={()=>onChange(resetAuroraAppearance(settings))}>Reset aurora appearance</button>
  </div>;
}
