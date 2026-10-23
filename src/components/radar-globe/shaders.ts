import { auroraShapeGLSL, auroraRayGLSL } from "@/lib/radar-aurora-shape";
import { auroraPhotoGLSL } from "@/lib/radar-aurora-photo";

// All positions are Earth-fixed kilometres. Weather uses north-first rows,
// -180°..180° columns. Density and shadows call the SAME function.
export const geoGLSL = `
#define gl_FragColor fragColor
const float PI=3.14159265359;
const vec3 RADII=vec3(6378.137,6356.752314245,6378.137);
uniform vec3 uSun;
uniform vec3 uCamera;
uniform float uTime;
uniform float uDayNight;
uniform float uAirSamples;
vec3 ellipsoidNormal(vec3 p){return normalize(p/(RADII*RADII));}
vec2 geographicUV(vec3 p){vec3 n=ellipsoidNormal(p);return vec2(atan(n.x,n.z)/(2.0*PI)+0.5,0.5-asin(clamp(n.y,-1.0,1.0))/PI);}
float altitudeKm(vec3 p){vec3 n=ellipsoidNormal(p);vec3 rn=RADII*n;vec3 foot=RADII*RADII*n/length(rn);return dot(p-foot,n);}
vec2 intersectEllipsoid(vec3 ro,vec3 rd,vec3 radii){vec3 a=ro/radii,b=rd/radii;float bb=dot(a,b),aa=dot(b,b),h=bb*bb-aa*(dot(a,a)-1.0);if(h<0.0)return vec2(-1.0);h=sqrt(h);return vec2((-bb-h)/aa,(-bb+h)/aa);}
float sunElevation(vec3 p){return mix(0.85,dot(ellipsoidNormal(p),uSun),uDayNight);}
vec3 aerialPerspective(vec3 colour,vec3 rd,float distanceKm){
  vec2 air=intersectEllipsoid(uCamera,rd,RADII+vec3(80.0));
  float begin=max(0.0,air.x),end=min(distanceKm,air.y);
  if(end<=begin)return colour;
  float dt=(end-begin)/uAirSamples,optical=0.0;
  for(int i=0;i<12;i++){
    if(float(i)>=uAirSamples)break;
    vec3 p=uCamera+rd*(begin+(float(i)+0.5)*dt);
    optical+=exp(-max(0.0,altitudeKm(p))/8.0)*dt;
  }
  vec3 transmission=exp(-vec3(0.0058,0.0135,0.0331)*optical);
  vec3 endPoint=uCamera+rd*end;
  float day=smoothstep(-0.15,0.07,sunElevation(endPoint));
  float mu=dot(rd,uSun),phase=0.75*(1.0+mu*mu);
  // The wavelength-dependent coefficient already supplies blue scattering.
  // A second saturated-blue source would count that colour twice and wash
  // out the ocean/terrain when the same path is viewed from orbit.
  vec3 sky=vec3(0.26,0.28,0.30)*day*phase+vec3(0.001,0.002,0.005);
  return colour*transmission+sky*(1.0-transmission);
}
`;

export const densityGLSL = `
precision highp sampler3D;
uniform sampler2D uLowWeather;
uniform sampler2D uMiddleWeather;
uniform sampler2D uHighWeather;
uniform sampler3D uBaseNoise;
uniform sampler3D uDetailNoise;
uniform vec3 uLayers;
uniform float uClouds;
uniform float uCloudOpacity;
uniform float uShadows;
uniform float uDebug;
uniform float uPixelAngle;
uniform float uShadowSamples;
const float CLOUD_EXTINCTION=25.0;
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
float densityAtDetail(vec3 p,bool fineDetail){
  if(uClouds<0.5)return 0.0;
  float h=altitudeKm(p);
  if(h<0.0||h>18.0)return 0.0;
  vec2 uv=geographicUV(p);
  float low=uLayers.x>0.5?layerCloud(weatherAt(uLowWeather,uv),p,h,0.0,fineDetail):0.0;
  float middle=uLayers.y>0.5?layerCloud(weatherAt(uMiddleWeather,uv),p,h,1.0,fineDetail):0.0;
  float high=uLayers.z>0.5?layerCloud(weatherAt(uHighWeather,uv),p,h,2.0,fineDetail):0.0;
  return max(low,max(middle,high));
}
float densityAt(vec3 p){return densityAtDetail(p,true);}
float lightDensityAt(vec3 p){return densityAtDetail(p,false);}
float shadowTransmittance(vec3 p){
  if(uShadows<0.5||uClouds<0.5)return 1.0;
  if(dot(ellipsoidNormal(p),uSun)<0.035)return 1.0;
  vec2 hit=intersectEllipsoid(p,uSun,RADII+vec3(18.0));
  float count=min(uShadowSamples,altitudeKm(uCamera)<120.0?16.0:8.0);
  float stepLength=max(0.0,hit.y)/count;
  float tau=0.0;
  for(int i=0;i<16;i++){if(float(i)>=count)break;tau+=densityAt(p+uSun*(float(i)+0.5)*stepLength)*stepLength*CLOUD_EXTINCTION;}
  return exp(-min(8.0,tau)*uCloudOpacity);
}
`;

export const surfaceVertex = `
uniform vec3 uTileOrigin;
#include <common>
#include <logdepthbuf_pars_vertex>
out vec3 vPosition;out vec3 vNormal;out vec2 vUv;
void main(){vPosition=position+uTileOrigin;vNormal=normal;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
#include <logdepthbuf_vertex>
}
`;
export const surfaceFragment = `
precision highp float;
in vec3 vPosition;in vec3 vNormal;in vec2 vUv;
uniform sampler2D uSurface;uniform sampler2D uNight;
uniform sampler2D uGroundShadow;uniform vec2 uGroundSize;uniform vec4 uNightTransform;uniform vec4 uDayTransform;uniform vec4 uShadowRegion;
#include <logdepthbuf_pars_fragment>
out vec4 fragColor;
${geoGLSL}
${densityGLSL}
void main(){
  #include <logdepthbuf_fragment>
  vec3 colour=texture(uSurface,vUv*uDayTransform.xy+uDayTransform.zw).rgb;
  float solar=sunElevation(vPosition);
  float day=smoothstep(-0.08,0.10,solar);
  float light=max(0.0,dot(normalize(vNormal),uSun));
  vec2 shadowUV=clamp(gl_FragCoord.xy/uGroundSize*uShadowRegion.xy,uShadowRegion.zw*0.5,uShadowRegion.xy-uShadowRegion.zw*0.5);
  float shadow=texture(uGroundShadow,shadowUV).r;
  vec3 diffuse=colour*(0.025+day*(0.24+1.50*sqrt(light))*mix(0.42,1.0,shadow));
  vec3 night=texture(uNight,vUv*uNightTransform.xy+uNightTransform.zw).rgb;
  float nightMask=1.0-smoothstep(-0.18,0.02,solar);
  diffuse+=night*nightMask*0.85*mix(0.38,1.0,shadow);
  // Ocean reflectance is a modest view-dependent highlight, no blue tint.
  float ocean=1.0-smoothstep(0.02,0.10,max(colour.r,max(colour.g,colour.b)));
  vec3 view=normalize(uCamera-vPosition),halfway=normalize(view+uSun);
  float glint=pow(max(0.0,dot(vNormal,halfway)),180.0)*ocean*day*shadow;
  diffuse+=vec3(0.6,0.67,0.71)*glint*0.38;
  float limb=pow(1.0-max(0.0,dot(view,vNormal)),3.0)*day;
  diffuse=mix(diffuse,vec3(0.17,0.30,0.46),limb*0.27);
  diffuse=aerialPerspective(diffuse,normalize(vPosition-uCamera),length(vPosition-uCamera));
  fragColor=vec4(diffuse,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export const volumeVertex = `
#include <common>
#include <logdepthbuf_pars_vertex>
out vec3 vPosition;void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
#include <logdepthbuf_vertex>
}`;

export const cloudFragment = `
precision highp float;
in vec3 vPosition;out vec4 fragColor;
uniform float uSteps;
uniform float uLightSamples;
uniform float uLightStepKm;
uniform sampler2D uTerrainDepth;uniform vec2 uTerrainDepthSize;
#include <packing>
${geoGLSL}
${densityGLSL}
float phaseHG(float mu,float g){return (1.0-g*g)/pow(max(0.01,1.0+g*g-2.0*g*mu),1.5);}
void main(){
  vec3 rd=normalize(vPosition-uCamera);
  vec2 outer=intersectEllipsoid(uCamera,rd,RADII+vec3(18.0));
  if(outer.y<0.0)discard;
  float start=max(0.0,outer.x),end=outer.y;
  vec2 ground=intersectEllipsoid(uCamera,rd,RADII);
  if(ground.x>0.0)end=min(end,ground.x);
  end=min(end,unpackRGBAToDepth(texture(uTerrainDepth,gl_FragCoord.xy/uTerrainDepthSize))*65536.0);
  if(end<=start)discard;
  // A fixed orbital step leaves only 3-4 samples through a low cloud. At
  // close zoom that produces contour rings rather than a continuous volume.
  bool flightView=altitudeKm(uCamera)<120.0;
  if(flightView)end=min(end,300.0);
  float footprint=max(0.0,altitudeKm(uCamera))*uPixelAngle;
  float stepKm=clamp(footprint*0.45,0.08,0.75);
  float steps=clamp(ceil((end-start)/stepKm),uSteps,min(384.0,uSteps*8.0));
  float dt=(end-start)/steps;
  float transmittance=1.0,meanDistance=0.0,travel=start,previousDensity=0.0;
  float tau=0.0,lastLightAt=-1000.0,lastLightDensity=0.0;
  vec3 radiance=vec3(0.0);
  float phase=mix(phaseHG(dot(rd,uSun),0.65),phaseHG(dot(rd,uSun),-0.20),0.35);
  // Deterministic midpoint integration: no screen-space pattern that swims
  // across geographic clouds while the pilot orbits or zooms.
  for(int i=0;i<768;i++){
    if(!flightView&&float(i)>=steps)break;
    if(flightView&&float(i)>=min(768.0,uSteps*16.0))break;
    if(travel>=end)break;
    float fineStep=clamp(travel*uPixelAngle*0.65,0.04,0.8);
    float sampleStep=flightView?(previousDensity<0.003?max(fineStep,0.18+(travel-start)*0.002):fineStep):dt;
    sampleStep=min(sampleStep,end-travel);
    vec3 p=uCamera+rd*(travel+sampleStep*0.5);
    float density=densityAt(p);
    if(flightView&&density>0.003&&sampleStep>fineStep*1.01){
      sampleStep=min(fineStep,end-travel);
      p=uCamera+rd*(travel+sampleStep*0.5);density=densityAt(p);
    }
    // Fade the distant flight-view LOD before its hard march limit. Otherwise
    // a high layer intersecting that limit can end in a rectangular wall.
    if(flightView)density*=1.0-smoothstep(230.0,300.0,travel);
    travel+=sampleStep;previousDensity=density;
    // Cirrus peaks below 0.003: the old dense-cloud cutoff discarded the
    // entire high layer. Thin cloud is integrated without costly light rays.
    if(density<0.00025){lastLightAt=-1000.0;continue;}
    float solar=sunElevation(p),day=smoothstep(-0.10,0.05,solar);
    // Reuse secondary illumination across a short smooth part of this ray.
    // A density edge or gap forces a new query; never reuse across frames.
    if(density<0.003){tau=0.0;lastLightAt=-1000.0;}
    else if(uShadows>0.5&&(travel-lastLightAt>=uLightStepKm||abs(density-lastLightDensity)>max(0.015,lastLightDensity*0.3))){
      if(uLightSamples<3.5)tau=densityAt(p+uSun*0.08)*0.19+lightDensityAt(p+uSun*0.60)*0.84+lightDensityAt(p+uSun*2.4)*3.8;
      else if(uLightSamples<4.5)tau=densityAt(p+uSun*0.05)*0.13+densityAt(p+uSun*0.25)*0.40+lightDensityAt(p+uSun*1.0)*1.22+lightDensityAt(p+uSun*3.0)*3.08;
      else tau=densityAt(p+uSun*0.035)*0.07+densityAt(p+uSun*0.13)*0.12+densityAt(p+uSun*0.33)*0.28+lightDensityAt(p+uSun*0.75)*0.56+lightDensityAt(p+uSun*1.6)*1.14+lightDensityAt(p+uSun*3.5)*2.66;
      tau*=CLOUD_EXTINCTION;
      lastLightAt=travel;lastLightDensity=density;
    }
    // Optical-depth lighting, not a solid-surface normal. Successively softer
    // scattering terms retain light in the body and blue light underneath.
    float scattering=exp(-tau)+0.16*exp(-tau*0.25)+0.035*exp(-tau*0.06);
    float powder=mix(1.0,1.0-exp(-tau*2.0),0.35);
    float heightLight=clamp(altitudeKm(p)/12.0,0.0,1.0);
    float ambientOcclusion=mix(0.78,1.0,exp(-density*4.0));
    vec3 illumination=vec3(0.009,0.015,0.03)+day*(vec3(0.08,0.14,0.25)*(0.45+heightLight*0.55)*ambientOcclusion+vec3(1.15,1.11,1.04)*scattering*phase*powder);
    float sunset=(1.0-smoothstep(0.0,0.16,abs(solar)))*day;
    illumination=mix(illumination,illumination*vec3(1.1,0.69,0.42),sunset*0.45);
    float alpha=1.0-exp(-density*sampleStep*CLOUD_EXTINCTION*uCloudOpacity);
    float contribution=transmittance*alpha;
    radiance+=contribution*illumination;
    meanDistance+=contribution*(travel-sampleStep*0.5);
    transmittance*=1.0-alpha;
    if(transmittance<0.015)break;
  }
  float alpha=1.0-transmittance;if(alpha<0.004)discard;
  if(uDebug>0.5){
    vec3 p=uCamera+rd*((start+end)*0.5);vec2 uv=geographicUV(p);
    vec4 weather=texture(uLowWeather,uv);
    vec3 diagnostic=vec3(alpha);
    if(uDebug>1.5&&uDebug<2.5)diagnostic=vec3(weather.r);
    if(uDebug>2.5&&uDebug<3.5)diagnostic=vec3(weather.g,weather.b,0.1);
    if(uDebug>3.5&&uDebug<4.5)diagnostic=vec3(max(0.0,sunElevation(p)));
    fragColor=vec4(diagnostic,max(0.6,alpha));return;
  }
  vec3 colour=aerialPerspective(radiance/max(0.001,alpha),rd,meanDistance/max(0.001,alpha));
  fragColor=vec4(colour,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Sun-to-ground integration is evaluated on a reduced-resolution screen grid,
// not repeated at the full-resolution terrain for every texture fragment.
export const groundShadowFragment = `
precision highp float;
in vec3 vPosition;out vec4 fragColor;
uniform sampler2D uTerrainDepth;uniform vec2 uTerrainDepthSize;uniform vec2 uTerrainDepthViewport;uniform vec2 uShadowDrawSize;
#include <packing>
${geoGLSL}
${densityGLSL}
void main(){
  vec3 rd=normalize(vPosition-uCamera);
  vec2 ground=intersectEllipsoid(uCamera,rd,RADII);
  float shadow=1.0;
  float distanceKm=unpackRGBAToDepth(texture(uTerrainDepth,gl_FragCoord.xy/uShadowDrawSize*uTerrainDepthViewport/uTerrainDepthSize))*65536.0;
  if(distanceKm<65000.0){vec3 p=uCamera+rd*distanceKm;shadow=shadowTransmittance(p+ellipsoidNormal(p)*0.04);}
  else if(ground.x>0.0){vec3 p=uCamera+rd*ground.x;shadow=shadowTransmittance(p+ellipsoidNormal(p)*0.04);}
  fragColor=vec4(vec3(shadow),1.0);
}
`;
export const terrainDepthFragment=`
precision highp float;
in vec3 vPosition;uniform vec3 uCamera;out vec4 fragColor;
#include <logdepthbuf_pars_fragment>
#include <packing>
void main(){
#include <logdepthbuf_fragment>
fragColor=packDepthToRGBA(min(0.99999,length(vPosition-uCamera)/65536.0));
}`;
export const compositeVertex = `out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
export const cloudCompositeFragment = `
precision highp float;
#define gl_FragColor fragColor
uniform sampler2D uCloudImage;
uniform vec4 uCloudRegion;
in vec2 vUv;out vec4 fragColor;
void main(){
  // Cloud RT stores premultiplied linear radiance. Interpolating that, rather
  // than straight colour against black, avoids dark fringes on cloud edges.
  vec2 uv=clamp(vUv*uCloudRegion.xy,uCloudRegion.zw*0.5,uCloudRegion.xy-uCloudRegion.zw*0.5);
  vec4 cloud=texture(uCloudImage,uv);
  if(cloud.a<0.001)discard;
  fragColor=vec4(cloud.rgb/max(0.001,cloud.a),cloud.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const atmosphereFragment = `
precision highp float;
in vec3 vPosition;out vec4 fragColor;
#include <logdepthbuf_pars_fragment>
${geoGLSL}
void main(){
  #include <logdepthbuf_fragment>
  vec3 rd=normalize(vPosition-uCamera);vec2 bounds=intersectEllipsoid(uCamera,rd,RADII+vec3(80.0));if(bounds.y<0.0)discard;
  vec2 ground=intersectEllipsoid(uCamera,rd,RADII);
  // Terrain and clouds already apply air to their own true distance. Do not
  // flatten them under a second full-depth translucent blue shell.
  if(ground.x>0.0)discard;
  fragColor=vec4(aerialPerspective(vec3(0.0),rd,bounds.y),1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Local arc distance and altitude: finite, independently seeded and deforming
// in both horizontal directions. No global rings or camera-dependent pattern.
export const auroraVertex = `
in vec3 aNormal;in vec3 aField;in vec4 aArc;in vec3 aNextPosition;in vec3 aNextNormal;
uniform float uAuroraTime;uniform float uSpeed;uniform float uAuroraBlend;
#include <common>
#include <logdepthbuf_pars_vertex>
out vec3 vPosition;out vec3 vNormal;out vec3 vField;out vec4 vArc;
${auroraShapeGLSL}
void main(){
  float s=aField.x,seed=aField.z;
  vec2 fold=auroraFold(s,seed,uAuroraTime);
  vec3 n=normalize(mix(aNormal,aNextNormal,uAuroraBlend));
  vec3 east=normalize(cross(vec3(0.0,1.0,0.0),n));vec3 north=normalize(cross(n,east));
  vec3 blended=mix(position,aNextPosition,uAuroraBlend),radii=vec3(6378.137,6356.752314245,6378.137);
  // Slight upper-curtain shear, while retaining the dominant WMM inclination.
  float shear=(aField.y-120.0)*.025*auroraNoise(vec2(s*.004+seed,uAuroraTime*.04));
  blended+=north*(fold.x+shear)+east*fold.y;
  vec3 heightNormal=normalize(blended/(radii*radii)),foot=radii*radii*heightNormal/length(radii*heightNormal);
  vPosition=blended+heightNormal*(aField.y-dot(blended-foot,heightNormal));
  // Sample NOAA at the displaced footprint, not a fixed source latitude.
  vNormal=normalize(n+(north*fold.x+east*fold.y)/6371.0);vField=aField;vArc=aArc;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(vPosition,1.0);
  #include <logdepthbuf_vertex>
}
`;
export const auroraFragment = `
precision highp float;
in vec3 vPosition;in vec3 vNormal;in vec3 vField;in vec4 vArc;out vec4 fragColor;
uniform float uBrightness;uniform float uActivity;uniform float uSpeed;uniform float uAuroraTime;
uniform float uPhotoOverride;uniform vec4 uColourGains;
uniform sampler2D uAuroraPrevious;uniform sampler2D uAuroraCurrent;uniform float uAuroraBlend;uniform float uAuroraDebug;uniform float uHemisphere;
#include <logdepthbuf_pars_fragment>
${geoGLSL}
float bell(float h,float centre,float width){float q=(h-centre)/width;return exp(-0.5*q*q);}
${auroraPhotoGLSL}
${auroraShapeGLSL}
${auroraRayGLSL}
void main(){
  #include <logdepthbuf_fragment>
  if(uHemisphere*vNormal.y<0.0)discard;
  vec2 geo=vec2(atan(vNormal.x,vNormal.z)/(2.0*PI)+0.5,0.5-asin(clamp(vNormal.y,-1.0,1.0))/PI);vec2 uv=vec2(geo.x+0.5/360.0,(geo.y*180.0+0.5)/181.0);
  float probability=mix(texture(uAuroraPrevious,uv).r,texture(uAuroraCurrent,uv).r,uAuroraBlend);
  float strength=pow(smoothstep(0.045,0.6,probability),1.3);
  if(strength<0.00001)discard;
  float s=vField.x,h=vField.y,seed=vField.z,t=uAuroraTime;
  float taper=auroraTaper(vArc.x);
  if(taper<.001)discard;
  // Slow independent life cycles and moving bright knots leave genuine gaps.
  // These are coherent noise fields, not new random values on each frame.
  float life=.22+.78*auroraNoise(vec2(seed+23.0,t*.025));
  float knots=auroraNoise(vec2(s*.003-t*.07,seed+11.0));
  float gaps=smoothstep(.15,.5,auroraNoise(vec2(s*.0018+seed,t*.04+8.0)));
  float folds=auroraNoise(vec2(s*.008+seed,t*.07));
  vec4 packet=auroraRayState(s,seed,t);
  // Subpixel packets converge to a local low-frequency envelope, rather than
  // turning into flashing speckles when viewed from orbit.
  float unresolved=smoothstep(12.0,65.0,fwidth(s));
  packet.x=mix(packet.x,.35+.35*knots,unresolved);
  float lower=103.0+folds*31.0+packet.z;
  // Slower coherent travel with a different, gently varying drift per arc.
  // Zero time retains the accepted spatial filament pattern; no new vortex.
  float drift=t*(.10+.06*auroraHash(seed+51.0))+(sin(t*.08+seed)-sin(seed))*.7;
  float rayCoord=s*.17+auroraNoise(vec2(s*.018+seed,t*.12))*3.0-drift;
  rayCoord+=(h-lower)*.018*(auroraNoise(vec2(s*.005,seed))-.5);
  float filament=pow(auroraNoise(vec2(rayCoord,(h-lower)*.006+seed)),1.7);
  // Band-limit fixed geographic filaments; zoom only integrates their detail.
  filament=mix(filament,.3,smoothstep(.3,1.5,fwidth(rayCoord)));
  float rayTop=packet.y;
  float rays=packet.x*(.18+filament*2.2)*(1.0-smoothstep(rayTop,rayTop+28.0,h));
  // Remove the strong uniform sheet underneath the detail: packets can really
  // weaken/dissolve, not merely scroll a stripe texture across a bright pane.
  float body=bell(h,lower+26.0,23.0+folds*14.0)*(.10+packet.x*.55);
  body+=bell(h,lower+72.0,47.0)*rays*.85;
  body+=bell(h,packet.w,15.0)*max(0.0,packet.x-.12)*.16*(1.0-smoothstep(270.0,310.0,h));
  float hem=bell(h,lower+7.0,5.5)*(.08+sqrt(packet.x)*.65);
  // High oxygen glow evolves much more slowly than the prompt lower border.
  float red=bell(h,338.0+folds*30.0,55.0)*(.04+.12*auroraNoise(vec2(s*.003+seed,t*.005)))*smoothstep(280.0,315.0,h);
  float nitrogen=bell(h,lower+2.0,4.0)*.13*strength*packet.x;
  float vertical=smoothstep(95.0,108.0,h)*(1.0-smoothstep(400.0,450.0,h));
  float night=1.0-smoothstep(-0.18,0.08,dot(vNormal,uSun));
  float envelope=strength*uActivity*taper*vArc.y*life*gaps*(.35+knots)*night*uBrightness*vertical;
  vec3 emission=(vec3(.19,.85,.39)*body+vec3(.35,1.0,.57)*hem+vec3(.85,.035,.055)*red+vec3(.46,.10,.8)*nitrogen)*envelope*.48;
  // Keep the original expression/path when disabled or at neutral gains.
  // Only colour strengths change: shapes, animation and every envelope above
  // remain the accepted pre-override version.
  if(uPhotoOverride>.5&&any(notEqual(uColourGains,vec4(1.0))))
    emission=auroraPhotoEmission(body,hem,red,nitrogen,uColourGains)*envelope*.48;
  // Attenuate emitted light only; sky in-scattering is already in the atmosphere pass.
  vec3 rd=normalize(vPosition-uCamera);vec2 air=intersectEllipsoid(uCamera,rd,RADII+vec3(80.0));
  float begin=max(0.0,air.x),end=min(length(vPosition-uCamera),air.y),optical=0.0;
  if(end>begin)for(int i=0;i<8;i++){vec3 p=uCamera+rd*mix(begin,end,(float(i)+0.5)/8.0);optical+=exp(-max(0.0,altitudeKm(p))/8.0)*(end-begin)/8.0;}
  emission*=exp(-vec3(0.0058,0.0135,0.0331)*optical);
  if(uAuroraDebug>1.5)emission=mix(vec3(0.08,0.3,1.0),vec3(1.0,0.12,0.05),(h-95.0)/355.0)*0.25;
  fragColor=vec4(emission,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const auroraFieldVertex=`
#include <common>
#include <logdepthbuf_pars_vertex>
out vec3 vPosition;
void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
#include <logdepthbuf_vertex>
}`;
export const auroraFieldFragment=`
precision highp float;
in vec3 vPosition;out vec4 fragColor;
uniform sampler2D uAuroraPrevious;uniform sampler2D uAuroraCurrent;uniform float uAuroraBlend;uniform float uHemisphere;
#include <logdepthbuf_pars_fragment>
${geoGLSL}
void main(){
  #include <logdepthbuf_fragment>
  if(uHemisphere*vPosition.y<0.0)discard;
  vec2 geo=geographicUV(vPosition);vec2 uv=vec2(geo.x+0.5/360.0,(geo.y*180.0+0.5)/181.0);
  float p=mix(texture(uAuroraPrevious,uv).r,texture(uAuroraCurrent,uv).r,uAuroraBlend);
  if(p<0.01)discard;
  fragColor=vec4(mix(vec3(0.02,0.8,0.3),vec3(1.0,0.12,0.02),smoothstep(0.25,1.0,p)),sqrt(p)*0.65);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
