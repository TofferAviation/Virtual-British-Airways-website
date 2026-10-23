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
float layerCloud(vec4 w,vec3 p,float h,float kind){
  if(w.a<0.5||w.r<0.025)return 0.0;
  float base=w.g*25.5,top=w.b*25.5;
  if(top<base+0.12||h<base||h>top)return 0.0;
  float t=clamp((h-base)/(top-base),0.0,1.0);
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
  // The mass field is genuinely 3D, not a height map extruded into columns.
  // Regional organisation, kilometre-scale lobes and sub-km erosion are
  // separate signals, so every weather cell does not become identical beads.
  float scale=mix(6.4,28.0,min(1.0,kind));
  // Cumulus rises vertically; do not compress its lobes into pancakes.
  // Middle cloud is flatter; low cloud retains isotropic, upward-growing lobes.
  vec3 volume=p+normal*(h-base)*mix(0.0,0.9,min(1.0,kind))+vec3(regional.g,regional.b,regional.a)*2.8;
  vec4 mass=cloudNoise(uBaseNoise,volume/scale+kind*0.47,scale,p);
  float shape=dot(mass,vec4(0.25,0.40,0.25,0.10))+0.15-t*t*mix(0.42,0.26,growth);
  float profile=smoothstep(0.0,0.04,t)*(1.0-smoothstep(0.76,1.0,t));
  if(kind>0.5)profile=smoothstep(0.0,0.045,t)*(1.0-smoothstep(0.40,0.90,t));
  vec4 erosion=cloudNoise(uDetailNoise,volume/1.2+kind*0.19,1.2,p);
  float erosionFbm=dot(erosion.gba,vec3(0.625,0.25,0.125));
  float wisps=cloudNoise(uDetailNoise,volume/0.28+kind*0.27,0.28,p).b;
  float threshold=mix(0.81,0.30,cover);
  float edgeErosion=(1.0-erosionFbm)*0.15+(1.0-wisps)*0.035;
  float body=pow(smoothstep(threshold,threshold+0.06,shape-edgeErosion),1.25)*profile*(0.35+0.65*t);
  if(kind>1.5){
    float fibres=cloudNoise(uBaseNoise,(foot+normal*h*8.0)/vec3(240.0,50.0,75.0),50.0,p).r;
    body=smoothstep(threshold+0.015,threshold+0.18,fibres-(1.0-profile)*0.3)*0.003;
  }
  return body*smoothstep(0.0,0.03,t)*sqrt(cover);
}
float densityAt(vec3 p){
  if(uClouds<0.5)return 0.0;
  vec2 uv=geographicUV(p);float h=altitudeKm(p);
  float low=uLayers.x>0.5?layerCloud(weatherAt(uLowWeather,uv),p,h,0.0):0.0;
  float middle=uLayers.y>0.5?layerCloud(weatherAt(uMiddleWeather,uv),p,h,1.0):0.0;
  float high=uLayers.z>0.5?layerCloud(weatherAt(uHighWeather,uv),p,h,2.0):0.0;
  return max(low,max(middle,high));
}
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
out vec3 vPosition;out vec3 vNormal;out vec2 vUv;
void main(){vPosition=position;vNormal=normal;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`;
export const surfaceFragment = `
precision highp float;
in vec3 vPosition;in vec3 vNormal;in vec2 vUv;
uniform sampler2D uSurface;uniform sampler2D uNight;
uniform sampler2D uGroundShadow;uniform vec2 uGroundSize;uniform vec4 uNightTransform;
out vec4 fragColor;
${geoGLSL}
${densityGLSL}
void main(){
  vec3 colour=texture(uSurface,vUv).rgb;
  float solar=sunElevation(vPosition);
  float day=smoothstep(-0.08,0.10,solar);
  float light=max(0.0,solar);
  float shadow=texture(uGroundShadow,gl_FragCoord.xy/uGroundSize).r;
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
export const volumeVertex = `out vec3 vPosition;void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;

export const cloudFragment = `
precision highp float;
in vec3 vPosition;out vec4 fragColor;
uniform float uSteps;
uniform float uLightSamples;
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
  // A fixed orbital step leaves only 3-4 samples through a low cloud. At
  // close zoom that produces contour rings rather than a continuous volume.
  bool flightView=altitudeKm(uCamera)<120.0;
  if(flightView)end=min(end,300.0);
  float footprint=max(0.0,altitudeKm(uCamera))*uPixelAngle;
  float stepKm=clamp(footprint*0.45,0.08,0.75);
  float steps=clamp(ceil((end-start)/stepKm),uSteps,min(384.0,uSteps*8.0));
  float dt=(end-start)/steps;
  float transmittance=1.0,meanDistance=0.0,travel=start,previousDensity=0.0;
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
    travel+=sampleStep;previousDensity=density;
    if(density<0.003)continue;
    float solar=sunElevation(p),day=smoothstep(-0.10,0.05,solar);
    float tau=0.0;
    if(uShadows>0.5){
      if(uLightSamples<3.5)tau=densityAt(p+uSun*0.08)*0.19+densityAt(p+uSun*0.60)*0.84+densityAt(p+uSun*2.4)*3.8;
      else if(uLightSamples<4.5)tau=densityAt(p+uSun*0.05)*0.13+densityAt(p+uSun*0.25)*0.40+densityAt(p+uSun*1.0)*1.22+densityAt(p+uSun*3.0)*3.08;
      else tau=densityAt(p+uSun*0.035)*0.07+densityAt(p+uSun*0.13)*0.12+densityAt(p+uSun*0.33)*0.28+densityAt(p+uSun*0.75)*0.56+densityAt(p+uSun*1.6)*1.14+densityAt(p+uSun*3.5)*2.66;
      tau*=CLOUD_EXTINCTION;
    }
    // Optical-depth lighting, not a solid-surface normal. Successively softer
    // scattering terms retain light in the body and blue light underneath.
    float scattering=exp(-tau)+0.16*exp(-tau*0.25)+0.035*exp(-tau*0.06);
    float powder=mix(1.0,1.0-exp(-tau*2.0),0.35);
    float heightLight=clamp(altitudeKm(p)/12.0,0.0,1.0);
    vec3 illumination=vec3(0.009,0.015,0.03)+day*(vec3(0.08,0.14,0.25)*(0.45+heightLight*0.55)+vec3(1.15,1.11,1.04)*scattering*phase*powder);
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
${geoGLSL}
${densityGLSL}
void main(){
  vec3 rd=normalize(vPosition-uCamera);
  vec2 ground=intersectEllipsoid(uCamera,rd,RADII);
  float shadow=1.0;
  if(ground.x>0.0){vec3 p=uCamera+rd*ground.x;shadow=shadowTransmittance(p+ellipsoidNormal(p)*0.04);}
  fragColor=vec4(vec3(shadow),1.0);
}
`;
export const compositeVertex = `out vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
export const cloudCompositeFragment = `
precision highp float;
#define gl_FragColor fragColor
uniform sampler2D uCloudImage;
in vec2 vUv;out vec4 fragColor;
void main(){
  // Cloud RT stores premultiplied linear radiance. Interpolating that, rather
  // than straight colour against black, avoids dark fringes on cloud edges.
  vec4 cloud=texture(uCloudImage,vUv);
  if(cloud.a<0.001)discard;
  fragColor=vec4(cloud.rgb/max(0.001,cloud.a),cloud.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const atmosphereFragment = `
precision highp float;
in vec3 vPosition;out vec4 fragColor;
${geoGLSL}
void main(){
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

// Curtain mesh coordinates are periodic phase along the forecast oval and altitude.
// They never converge at the geographic pole, unlike longitude sine bands.
export const auroraVertex = `
in vec3 aNormal;in vec3 aField;
uniform float uTime;uniform float uSpeed;
out vec3 vPosition;out vec3 vNormal;out vec3 vField;
void main(){
  float fold=sin(aField.x*12.0+sin(aField.x*3.0+uTime*uSpeed*0.035)*1.8+uTime*uSpeed*0.08)*4.5;
  vec3 tangent=normalize(cross(aNormal,vec3(0.0,1.0,0.0)));
  vPosition=position+tangent*fold;vNormal=aNormal;vField=aField;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(vPosition,1.0);
}
`;
export const auroraFragment = `
precision highp float;
in vec3 vPosition;in vec3 vNormal;in vec3 vField;out vec4 fragColor;
uniform float uBrightness;uniform float uActivity;uniform float uSpeed;
${geoGLSL}
float bell(float h,float centre,float width){float q=(h-centre)/width;return exp(-0.5*q*q);}
void main(){
  float phase=vField.x,h=vField.y,strength=vField.z;
  float motion=uTime*uSpeed;
  float fold=0.5+0.5*sin(phase*22.0+sin(phase*6.0-motion*0.05)*2.0-motion*0.1);
  float rays=0.56+0.24*sin(phase*180.0+sin(phase*17.0)*2.0-motion*0.18)+0.13*sin(phase*345.0+motion*0.12);
  float core=bell(h,125.0,22.0)+bell(h,165.0,38.0)*0.28;
  float red=bell(h,265.0,48.0)*0.13*strength;
  float nitrogen=bell(h,100.0,7.0)*0.09;
  float night=1.0-smoothstep(-0.16,0.02,dot(vNormal,uSun));
  float envelope=strength*uActivity*(0.22+0.78*fold)*rays*night;
  float alpha=(core*0.40+red*0.15+nitrogen*0.20)*envelope*uBrightness;
  vec3 colour=vec3(0.10,0.80,0.31)*core+vec3(0.72,0.07,0.12)*red+vec3(0.30,0.10,0.65)*nitrogen;
  if(alpha<0.002)discard;
  fragColor=vec4(colour,clamp(alpha,0.0,0.52));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
