export const contrailVertex=`
#include <common>
#include <logdepthbuf_pars_vertex>
in vec3 aTangent;in float aBorn;in float aAlong;in float aSide;in float aSeed;
uniform float uTrailTime;uniform float uTrailPixelAngle;uniform mat4 uWorldToEarth;
out vec3 vPosition;out float vAge;out float vAlong;out float vSide;out float vSeed;
void main(){
  vAge=max(0.0,uTrailTime-aBorn);vAlong=aAlong;vSide=aSide;vSeed=aSeed;
  vec3 earth=(uWorldToEarth*modelMatrix*vec4(position,1.0)).xyz;
  vec3 normal=normalize(earth/vec3(6378.137*6378.137,6356.7523*6356.7523,6378.137*6378.137));
  vec3 east=normalize(vec3(normal.z+.00001,0.0,-normal.x));
  // Small deterministic, synthetic drift and rolling wake; no weather dependency.
  vec3 drift=east*(vAge*.0008)+normal*(sin(aAlong*.018+aSeed+vAge*.1)*min(.007,vAge*.0002));
  vec4 mv=modelViewMatrix*vec4(position,1.0);mv.xyz+=mat3(viewMatrix)*mat3(modelMatrix)*drift;
  vec3 tangent=mat3(modelViewMatrix)*aTangent;
  vec2 side=length(tangent.xy)>.000001?normalize(vec2(-tangent.y,tangent.x)):vec2(1.0,0.0);
  float width=(1.5+vAge*.90)*.001;
  // Subpixel distant trails stay soft/readable, never scale like the enlarged map aircraft.
  width=max(width,max(.001,-mv.z)*uTrailPixelAngle*.65);
  mv.xy+=side*aSide*width;
  vPosition=earth+drift;gl_Position=projectionMatrix*mv;
  #include <logdepthbuf_vertex>
}
`;

export function contrailFragment(geography:string,density:string){return `
precision highp float;
in vec3 vPosition;in float vAge;in float vAlong;in float vSide;in float vSeed;
uniform float uTrailLife;uniform float uTrailCloudSamples;
out vec4 fragColor;
#include <logdepthbuf_pars_fragment>
${geography}
${density}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float visibility(vec3 rd,float distanceKm){
  if(uClouds<.5)return 1.0;
  vec2 hit=intersectEllipsoid(uCamera,rd,RADII+vec3(18.0));
  float start=max(0.0,hit.x),end=min(distanceKm,hit.y);
  if(end<=start)return 1.0;
  float dt=(end-start)/uTrailCloudSamples,tau=0.0;
  // Bounded foreground-cloud probes only on trail pixels. Cloud rendering/cache is unchanged.
  for(int i=0;i<8;i++){if(float(i)>=uTrailCloudSamples)break;tau+=lightDensityAt(uCamera+rd*(start+(float(i)+.5)*dt))*dt*CLOUD_EXTINCTION;}
  return exp(-min(12.0,tau)*uCloudOpacity);
}
void main(){
  #include <logdepthbuf_fragment>
  if(vAge>=uTrailLife)discard;
  vec3 delta=vPosition-uCamera;float distanceKm=length(delta);vec3 rd=delta/max(.000001,distanceKm);
  vec2 ground=intersectEllipsoid(uCamera,rd,RADII);
  if(ground.x>0.0&&ground.x<distanceKm-.005)discard;
  float textureDetail=1.0-smoothstep(.5,2.0,fwidth(vAlong)*.035);
  float billows=mix(.76,.45+.55*noise2(vec2(vAlong*.025+vSeed,vSide*1.6)),textureDetail);
  float edge=exp(-vSide*vSide*2.6)*(1.0-smoothstep(.72,1.0,abs(vSide)));
  float alpha=edge*billows*smoothstep(.08,.8,vAge)*exp(-vAge*.017)*(1.0-smoothstep(uTrailLife*.75,uTrailLife,vAge))*.58;
  alpha*=1.0-smoothstep(150.0,1200.0,distanceKm);
  if(alpha<.002)discard;
  alpha*=visibility(rd,distanceKm);if(alpha<.002)discard;
  float solar=sunElevation(vPosition),day=smoothstep(-.16,.06,solar);
  vec3 tint=mix(vec3(1.0,.65,.40),vec3(.96,.98,1.0),smoothstep(.0,.22,solar));
  vec3 colour=mix(vec3(.04,.06,.10),tint*(.55+.55*sqrt(max(0.0,solar))),day);
  colour=aerialPerspective(colour,rd,distanceKm);
  fragColor=vec4(colour,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
}
