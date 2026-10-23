export type AuroraKpSettings={kpOverrideEnabled?:boolean;kpOverride?:number};
export function auroraKpOverride(settings:AuroraKpSettings):number|null {
  if(settings.kpOverrideEnabled!==true)return null;
  return Number.isFinite(settings.kpOverride)?Math.max(0,Math.min(9,Math.round(settings.kpOverride!))):5;
}
/** An explicitly illustrative oval, NOT a Kp-to-OVATION forecast model.
 * Generated only on a committed setting change, never per frame. A tilted
 * dipole is used for this preview alone; live NOAA cells are never rotated. */
export function auroraKpField(value:number) {
  const kp=Number.isFinite(value)?Math.max(0,Math.min(9,value)):5,rad=Math.PI/180;
  const poleLat=80.65*rad,poleLon=-72.68*rad;
  const centre=72-1.65*kp,width=1.4+.32*kp,peak=.11+.89*Math.pow(kp/9,.85);
  const grid=new Uint8Array(360*181);
  for(let y=0;y<181;y++){
    const lat=(90-y)*rad;
    for(let x=0;x<360;x++){
      const lon=(x-180)*rad;
      const magnetic=Math.asin(Math.max(-1,Math.min(1,Math.sin(lat)*Math.sin(poleLat)+Math.cos(lat)*Math.cos(poleLat)*Math.cos(lon-poleLon))))/rad;
      const hemisphere=magnetic>=0?1:-1;
      const q=(Math.abs(magnetic)-centre-Math.sin(lon+hemisphere)*1.2)/width;
      const variation=.72+.28*(.5+.5*Math.sin(lon*2+hemisphere*.8));
      grid[y*360+x]=Math.round(255*peak*variation*Math.exp(-.5*q*q));
    }
  }
  return grid;
}
