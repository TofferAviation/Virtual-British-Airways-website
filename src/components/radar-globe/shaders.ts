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
vec3 ellipsoidNormal(vec3 p){return normalize(p/(RADII*RADII));}
vec2 geographicUV(vec3 p){vec3 n=ellipsoidNormal(p);return vec2(atan(n.x,n.z)/(2.0*PI)+0.5,0.5-asin(clamp(n.y,-1.0,1.0))/PI);}
float altitudeKm(vec3 p){vec3 n=ellipsoidNormal(p);vec3 rn=RADII*n;vec3 foot=RADII*RADII*n/length(rn);return dot(p-foot,n);}
vec2 intersectEllipsoid(vec3 ro,vec3 rd,vec3 radii){vec3 a=ro/radii,b=rd/radii;float bb=dot(a,b),aa=dot(b,b),h=bb*bb-aa*(dot(a,a)-1.0);if(h<0.0)return vec2(-1.0);h=sqrt(h);return vec2((-bb-h)/aa,(-bb+h)/aa);}
float sunElevation(vec3 p){return mix(0.85,dot(ellipsoidNormal(p),uSun),uDayNight);}
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
float cloudNoise(sampler3D field,vec3 coordinates,float scale,vec3 p){
  // Explicit footprint filtering also works inside divergent raymarch loops.
  // Subpixel erosion must not turn into sparkling white grains when orbiting.
  float footprint=max(0.05,length(p-uCamera)*uPixelAngle);
  float lod=max(0.0,log2(48.0*footprint/scale));
  return textureLod(field,coordinates,lod).r;
}
vec4 weatherAt(sampler2D field,vec2 uv){return textureLod(field,uv,0.0);}
float layerCloud(vec4 w,vec3 p,float h,float kind){
  if(w.a<0.5||w.r<0.025)return 0.0;
  float base=w.g*25.5,top=w.b*25.5;
  if(top<base+0.12||h<base||h>top)return 0.0;
  float t=clamp((h-base)/(top-base),0.0,1.0);
  // Cartesian sampling is continuous across poles and the antimeridian.
  // Microstructure is inferred. The numerical weather model supplies cover
  // and pressure-layer heights, not observed individual cumulus geometry.
  vec3 flow=p-ellipsoidNormal(p)*h;
  float broad=cloudNoise(uBaseNoise,flow/920.0+kind*0.17,920.0,p);
  float billow=cloudNoise(uBaseNoise,flow/110.0+vec3(0.31,0.21,kind),110.0,p);
  float puffs=cloudNoise(uDetailNoise,flow/50.0+kind*0.23,50.0,p);
  float detail=cloudNoise(uDetailNoise,p/20.0,20.0,p);
  float fine=cloudNoise(uDetailNoise,p/2.4+kind*0.31,2.4,p);
  float shape=broad*0.20+billow*0.52+puffs*0.28;
  float cover=smoothstep(0.025,0.98,w.r);
  float threshold=mix(0.60,0.22,cover);
  // Convex height erosion rounds the cloud tops while a short bottom ramp
  // keeps a flattened condensation base. Kilometre-scale cells supply the
  // billows; smaller cellular erosion breaks up the silhouette.
  float cloudTop=0.22+0.78*smoothstep(threshold,threshold+0.32,shape)-detail*0.07-fine*0.04;
  float body=smoothstep(threshold,threshold+0.10,shape-detail*0.06-fine*0.02);
  float vertical=smoothstep(0.0,0.07,t)*(1.0-smoothstep(cloudTop-0.16,cloudTop,t));
  if(kind>1.5){
    float fibres=cloudNoise(uDetailNoise,flow/vec3(185.0,26.0,38.0),26.0,p);
    body=smoothstep(threshold+0.08,threshold+0.23,shape*0.45+fibres*0.55);
    vertical=smoothstep(0.0,0.15,t)*(1.0-smoothstep(0.55,1.0,t));body*=0.09;
  }
  return body*vertical*sqrt(cover);
}
float densityAt(vec3 p){
  vec2 uv=geographicUV(p);float h=altitudeKm(p);
  return uClouds*max(layerCloud(weatherAt(uLowWeather,uv),p,h,0.0)*uLayers.x,max(layerCloud(weatherAt(uMiddleWeather,uv),p,h,1.0)*uLayers.y,layerCloud(weatherAt(uHighWeather,uv),p,h,2.0)*uLayers.z));
}
float shadowTransmittance(vec3 p){
  if(uShadows<0.5||uClouds<0.5)return 1.0;
  if(dot(ellipsoidNormal(p),uSun)<0.035)return 1.0;
  vec2 hit=intersectEllipsoid(p,uSun,RADII+vec3(18.0));
  float stepLength=max(0.0,hit.y)/8.0;
  float tau=0.0;
  for(int i=0;i<8;i++){tau+=densityAt(p+uSun*(float(i)+0.5)*stepLength)*stepLength*0.65;}
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
out vec4 fragColor;
${geoGLSL}
${densityGLSL}
void main(){
  vec3 colour=texture(uSurface,vUv).rgb;
  float solar=sunElevation(vPosition);
  float day=smoothstep(-0.08,0.10,solar);
  float light=max(0.0,solar);
  float shadow=shadowTransmittance(vPosition+vNormal*0.04);
  vec3 diffuse=colour*(0.025+day*(0.24+1.50*sqrt(light))*mix(0.42,1.0,shadow));
  vec3 night=texture(uNight,vUv).rgb;
  float nightMask=1.0-smoothstep(-0.18,0.02,solar);
  diffuse+=night*nightMask*0.85*mix(0.38,1.0,shadow);
  // Ocean reflectance is a modest view-dependent highlight, no blue tint.
  float ocean=1.0-smoothstep(0.02,0.10,max(colour.r,max(colour.g,colour.b)));
  vec3 view=normalize(uCamera-vPosition),halfway=normalize(view+uSun);
  float glint=pow(max(0.0,dot(vNormal,halfway)),180.0)*ocean*day*shadow;
  diffuse+=vec3(0.6,0.67,0.71)*glint*0.38;
  float limb=pow(1.0-max(0.0,dot(view,vNormal)),3.0)*day;
  diffuse=mix(diffuse,vec3(0.17,0.30,0.46),limb*0.27);
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
${geoGLSL}
${densityGLSL}
void main(){
  vec3 rd=normalize(vPosition-uCamera);
  vec2 outer=intersectEllipsoid(uCamera,rd,RADII+vec3(18.0));
  if(outer.y<0.0)discard;
  float start=max(0.0,outer.x),end=outer.y;
  vec2 ground=intersectEllipsoid(uCamera,rd,RADII);
  if(ground.x>0.0)end=min(end,ground.x);
  // A fixed orbital step leaves only 3-4 samples through a low cloud. At
  // close zoom that produces contour rings rather than a continuous volume.
  float footprint=length(vPosition-uCamera)*uPixelAngle;
  float stepKm=clamp(footprint*0.45,0.08,0.75);
  float steps=clamp(ceil((end-start)/stepKm),uSteps,min(384.0,uSteps*8.0));
  float dt=(end-start)/steps;
  float transmittance=1.0;vec3 radiance=vec3(0.0);
  float billowLight=1.0;bool normalEstimated=false;
  // Deterministic midpoint integration: no screen-space pattern that swims
  // across geographic clouds while the pilot orbits or zooms.
  for(int i=0;i<384;i++){
    if(float(i)>=steps)break;
    vec3 p=uCamera+rd*(start+(float(i)+0.5)*dt);
    float density=densityAt(p);
    if(density<0.005)continue;
    // A density-gradient lighting approximation makes the rounded exterior
    // readable. Estimate once per ray, then retain full volumetric extinction
    // and solar shadow sampling through the rest of the cloud column.
    if(!normalEstimated&&density>0.025){
      float e=max(0.1,length(p-uCamera)*uPixelAngle*0.6);
      vec3 gradient=vec3(densityAt(p+vec3(e,0.0,0.0)),densityAt(p+vec3(0.0,e,0.0)),densityAt(p+vec3(0.0,0.0,e)))-vec3(density);
      vec3 normal=length(gradient)>0.0001?normalize(-gradient):ellipsoidNormal(p);
      billowLight=0.40+0.60*max(0.0,dot(normal,uSun));normalEstimated=true;
    }
    float solar=sunElevation(p),day=smoothstep(-0.10,0.05,solar);
    float selfShadow=1.0;
    if(uShadows>0.5){float tau=densityAt(p+uSun*0.35)*0.7+densityAt(p+uSun*1.25)*1.1+densityAt(p+uSun*3.0)*2.4+densityAt(p+uSun*6.5)*4.6+densityAt(p+uSun*13.0)*8.4;selfShadow=exp(-tau*0.7);}
    float forward=pow(max(0.0,dot(rd,uSun)),8.0);
    float heightLight=clamp(altitudeKm(p)/12.0,0.0,1.0);
    vec3 illumination=vec3(0.015,0.025,0.045)+day*(vec3(0.17,0.22,0.30)*(0.65+heightLight*0.35)+vec3(1.08,1.04,0.98)*selfShadow*billowLight*(0.70+forward*0.65));
    float sunset=(1.0-smoothstep(0.0,0.16,abs(solar)))*day;
    illumination=mix(illumination,illumination*vec3(1.1,0.69,0.42),sunset*0.45);
    float alpha=1.0-exp(-density*dt*0.78*uCloudOpacity);
    radiance+=transmittance*illumination*alpha;transmittance*=1.0-alpha;
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
  fragColor=vec4(radiance/max(0.001,alpha),alpha);
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
  float begin=max(0.0,bounds.x),end=bounds.y;vec2 ground=intersectEllipsoid(uCamera,rd,RADII);if(ground.x>0.0)end=min(end,ground.x);
  float dt=(end-begin)/12.0;float optical=0.0;vec3 light=vec3(0.0);
  float mu=dot(rd,uSun);float phase=0.75*(1.0+mu*mu);
  for(int i=0;i<12;i++){
    vec3 p=uCamera+rd*(begin+(float(i)+0.5)*dt);float h=max(0.0,altitudeKm(p));
    float d=exp(-h/8.0)*dt*0.009;float s=sunElevation(p);
    float day=smoothstep(-0.12,0.03,s);float red=exp(-abs(s+0.015)*28.0);
    light+=d*phase*(vec3(0.16,0.39,0.85)*day+vec3(0.9,0.23,0.06)*red*0.45);optical+=d;
  }
  float alpha=min(0.42,1.0-exp(-optical));if(alpha<0.001)discard;
  fragColor=vec4(light/max(optical,0.001),alpha);
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
