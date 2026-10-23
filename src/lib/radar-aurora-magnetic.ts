import { WMM2025 } from "./data/wmm2025";
import { geodeticToWorld, geodeticNormal, type GlobeVector } from "./radar-globe-geodesy";
const factorial=(n:number)=>{let result=1;for(let i=2;i<=n;i++)result*=i;return result;};
const schmidt=Array.from({length:13},(_,n)=>Array.from({length:13},(_,m)=>m<=n?Math.sqrt((m===0?1:2)*factorial(n-m)/factorial(n+m)):0));
/** Degree/order 12 WMM2025 spherical harmonics with secular variation.
 * Returns nT in this globe's Earth-fixed axes. Dates outside 2025–2030 fail
 * closed; this is a visual field-line model, not a navigation instrument. */
export function magneticField(latitude:number,longitude:number,heightKm:number,year:number):GlobeVector {
  if(![latitude,longitude,heightKm,year].every(Number.isFinite)||Math.abs(latitude)>90||heightKm< -1||heightKm>850||year<2025||year>=2030)throw new Error("Outside WMM2025 domain");
  const [x,y,z]=geodeticToWorld(latitude,longitude,heightKm*1000),r=Math.hypot(x,y,z),lambda=longitude*Math.PI/180;
  const theta=Math.max(1e-7,Math.min(Math.PI-1e-7,Math.acos(y/r))),ct=Math.cos(theta),st=Math.sin(theta);
  const p=Array.from({length:13},()=>new Float64Array(13));p[0][0]=1;
  for(let n=1;n<=12;n++)for(let m=0;m<=n;m++)p[n][m]=n===m?(2*m-1)*st*p[n-1][m-1]:n===m+1?(2*m+1)*ct*p[n-1][m]:((2*n-1)*ct*p[n-1][m]-(n+m-1)*p[n-2][m])/(n-m);
  let br=0,bt=0,bp=0;
  for(const [n,m,g0,h0,dg,dh] of WMM2025) {
    const g=g0+(year-2025)*dg,h=h0+(year-2025)*dh,co=Math.cos(m*lambda),si=Math.sin(m*lambda),q=(6371.2/r)**(n+2),s=schmidt[n][m];
    const value=p[n][m]*s,derivative=(n*ct*p[n][m]-(n+m)*(n>m?p[n-1][m]:0))/st*s;
    br+=(n+1)*q*(g*co+h*si)*value;bt-=q*(g*co+h*si)*derivative;bp+=q*m*(g*si-h*co)*value/st;
  }
  return [br*st*Math.sin(lambda)+bt*ct*Math.sin(lambda)+bp*Math.cos(lambda),br*ct-bt*st,br*st*Math.cos(lambda)+bt*ct*Math.cos(lambda)-bp*Math.sin(lambda)];
}
export function magneticNorthEastDown(latitude:number,longitude:number,heightKm:number,year:number) {
  const b=magneticField(latitude,longitude,heightKm,year),n=geodeticNormal(latitude,longitude),phi=latitude*Math.PI/180,lam=longitude*Math.PI/180;
  return {north:b[0]*(-Math.sin(phi)*Math.sin(lam))+b[1]*Math.cos(phi)+b[2]*(-Math.sin(phi)*Math.cos(lam)),east:b[0]*Math.cos(lam)-b[2]*Math.sin(lam),down:-b.reduce((sum,v,i)=>sum+v*n[i],0)};
}
