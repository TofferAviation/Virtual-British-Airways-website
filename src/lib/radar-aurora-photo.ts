export type AuroraColour = "green" | "red" | "violet" | "blue";
export type AuroraColourGains = Record<AuroraColour, number>;
export type AuroraPhotoSettings = {
  photoMode?: boolean;
  colourGains?: AuroraColourGains;
};
export const DEFAULT_AURORA_COLOURS: AuroraColourGains = {green:1,red:1,violet:1,blue:1};

export function auroraPhotoUniforms(settings: AuroraPhotoSettings) {
  const enabled=settings.photoMode===true;
  return {enabled, gains:(["green","red","violet","blue"] as const).map(key=>{
    const value=settings.colourGains?.[key];
    return enabled&&Number.isFinite(value)?Math.max(0,Math.min(4,value!)):1;
  }) as [number,number,number,number]};
}
export function resetAuroraPhoto<T extends AuroraPhotoSettings>(settings:T):T {
  return {...settings,photoMode:false,colourGains:{...DEFAULT_AURORA_COLOURS}};
}

// Preserve the accepted palette. The existing nitrogen RGB is split into two
// non-negative parts so neutral violet + blue exactly reproduce its spectrum.
const PALETTE = [[.19,.85,.39],[.35,1,.57],[.85,.035,.055],[.46,.05,.4],[0,.05,.4]] as const;
/** CPU reference for the screenshot-only shader, before the unchanged NOAA,
 * altitude, night-side and atmosphere envelopes are applied. */
export function auroraPhotoEmission(body:number,hem:number,red:number,nitrogen:number,gains:readonly number[]) {
  const weights=[body*gains[0],hem*gains[0],red*gains[1],nitrogen*gains[2],nitrogen*gains[3]];
  return [0,1,2].map(channel=>PALETTE.reduce((sum,colour,i)=>sum+colour[channel]*weights[i],0));
}
const vec=(index:number)=>`vec3(${PALETTE[index].map(n=>n.toFixed(3)).join(",")})`;
export const auroraPhotoGLSL=`
vec3 auroraPhotoEmission(float body,float hem,float red,float nitrogen,vec4 gains){
  return (${vec(0)}*body+${vec(1)}*hem)*gains.x+${vec(2)}*red*gains.y+
    ${vec(3)}*nitrogen*gains.z+${vec(4)}*nitrogen*gains.w;
}`;
