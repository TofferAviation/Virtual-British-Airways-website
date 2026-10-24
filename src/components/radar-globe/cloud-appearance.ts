/**
 * Cloud appearance from the last accepted pre-satellite build, 5495a8d.
 * Keep observation policy OUT of this module. Shape/erosion/LOD changes need
 * an explicit visual baseline review; a numerical test is not visual approval.
 */
export const ACCEPTED_CLOUD_REVISION = "5495a8d";
export const acceptedCloudAppearanceGLSL = `
vec4 cloudNoise(sampler3D field,vec3 coordinates,float scale,vec3 p){
  // Explicit footprint filtering also works inside divergent raymarch loops.
  // Subpixel erosion must not turn into sparkling white grains when orbiting.
  float footprint=max(0.015,length(p-uCamera)*uPixelAngle);
  float lod=max(0.0,log2(float(textureSize(field,0).x)*footprint/scale));
  return textureLod(field,coordinates,lod);
}
vec4 weatherAt(sampler2D field,vec2 uv){return textureLod(field,uv,0.0);}
float layerCloud(vec4 w,vec3 p,float h,float kind,bool fineDetail){
  if(w.a<0.5||w.r<0.025)return 0.0;
  float base=w.g*25.5,top=w.b*25.5;
  if(top<base+0.12||h<base||h>top)return 0.0;
  float t=clamp((h-base)/(top-base),0.0,1.0);
  float profile=smoothstep(0.0,0.04,t)*(1.0-smoothstep(0.76,1.0,t));
  if(kind>0.5)profile=smoothstep(0.0,0.045,t)*(1.0-smoothstep(0.40,0.90,t));
  if(profile<=0.0)return 0.0;
  vec3 normal=ellipsoidNormal(p),foot=p-normal*h;
  vec4 regional=cloudNoise(uBaseNoise,foot/360.0+kind*0.31,360.0,p);
  float organisation=cloudNoise(uBaseNoise,foot/90.0+kind*0.71,90.0,p).r;
  // GFS reports areal coverage, not a filled-volume fraction. The nonlinear
  // threshold calibration prevents several vertical lobes from each counting
  // that coverage again and turning broken cumulus into an overcast blanket.
  float groupSignal=smoothstep(0.28,0.72,organisation);
  float bank=smoothstep(1.0-w.r-0.18,1.0-w.r+0.18,groupSignal);
  float cover=clamp(w.r*w.r+(bank-0.5)*0.85+(regional.r-0.5)*0.5,0.0,1.0);
  float growth=smoothstep(0.30,0.70,regional.r);
  float threshold=mix(0.81,0.30,cover);
  // Cirrus does not use cumulus mass/erosion at all. Do not pay for three
  // volume lookups only to overwrite their result with the fibre model.
  if(kind>1.5){
    float fibres=cloudNoise(uBaseNoise,(foot+normal*h*8.0)/vec3(240.0,50.0,75.0),50.0,p).r;
    return smoothstep(threshold+0.015,threshold+0.18,fibres-(1.0-profile)*0.3)*0.003*smoothstep(0.0,0.03,t)*sqrt(cover);
  }
  // The mass field is genuinely 3D, not a height map extruded into columns.
  // Regional organisation, kilometre-scale lobes and sub-km erosion are
  // separate signals, so every weather cell does not become identical beads.
  float scale=mix(6.4,28.0,min(1.0,kind));
  // Cumulus rises vertically; do not compress its lobes into pancakes.
  // Middle cloud is flatter; low cloud retains isotropic, upward-growing lobes.
  vec3 volume=p+normal*(h-base)*mix(0.0,0.9,min(1.0,kind))+vec3(regional.g,regional.b,regional.a)*2.8;
  vec4 mass=cloudNoise(uBaseNoise,volume/scale+kind*0.47,scale,p);
  float shape=dot(mass,vec4(0.25,0.40,0.25,0.10))+0.15-t*t*mix(0.42,0.26,growth);
  // Erosion only subtracts (0..0.185). These two tests are exact bounds:
  // empty mass and saturated interior cannot be changed by fine erosion.
  float margin=shape-threshold;
  if(margin<=0.0)return 0.0;
  float edgeErosion=0.0;
  if(margin<0.245){
    edgeErosion=0.105; // filtered erosion for distant secondary light probes
    if(fineDetail){
      vec4 erosion=cloudNoise(uDetailNoise,volume/1.2+kind*0.19,1.2,p);
      float erosionFbm=dot(erosion.gba,vec3(0.625,0.25,0.125));
      float wisps=cloudNoise(uDetailNoise,volume/0.28+kind*0.27,0.28,p).b;
      edgeErosion=(1.0-erosionFbm)*0.15+(1.0-wisps)*0.035;
    }
  }
  float body=pow(smoothstep(threshold,threshold+0.06,shape-edgeErosion),1.25)*profile*(0.35+0.65*t);
  return body*smoothstep(0.0,0.03,t)*sqrt(cover);
}
`;
