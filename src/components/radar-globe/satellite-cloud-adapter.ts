import { satelliteAppearanceGLSL } from "@/lib/radar-satellite-render";
import { CLOUD_FOOTPRINT_RANGE, CLOUD_BOUNDARY_BAND_KM } from "@/lib/radar-cloud-footprint";

/** Observation policy only. The appearance kernel is restored independently
 * from 5495a8d; do not tune its frequency, erosion or lighting in this adapter.
 * Retrieved top/COD are inputs; base/thickness and sub-grid type are estimates.
 */
export const satelliteCloudAdapterGLSL = `
${satelliteAppearanceGLSL}
vec4 cloudCubicWeights(float f){
  float f2=f*f,f3=f2*f;
  return vec4(1.0-3.0*f+3.0*f2-f3,4.0-6.0*f2+3.0*f3,1.0+3.0*f+3.0*f2-3.0*f3,f3)/6.0;
}
float cloudObservationDistance(vec2 uv){
  ivec2 grid=textureSize(uSatelliteCurrent,0);
  vec2 pixel=uv*vec2(grid),within=fract(pixel);
  ivec2 cell=ivec2(floor(pixel));
  vec2 cellKm=vec2(40030.228/float(grid.x)*max(0.0,cos((0.5-uv.y)*PI)),20015.114/float(grid.y));
  int rx=min(7,int(ceil(${CLOUD_BOUNDARY_BAND_KM.toFixed(1)}/max(0.001,cellKm.x))));
  float nearest=1e6;
  for(int dy=-1;dy<=1;dy++)for(int dx=-7;dx<=7;dx++){
    if(abs(dx)>rx)continue;
    ivec2 c=cell+ivec2(dx,dy);
    if(c.y<0||c.y>=grid.y)continue;
    c.x=(c.x%grid.x+grid.x)%grid.x;
    float flags=floor(texelFetch(uSatelliteCurrent,c,0).a*255.0+0.5),state=mod(flags,8.0);
    if(state<2.5||state>4.5||mod(floor(flags/8.0),4.0)>0.5)continue;
    nearest=min(nearest,length(max(abs(within-vec2(float(dx),float(dy))-0.5)-0.5,vec2(0.0))*cellKm));
  }
  return nearest;
}
float cloudFormationDistance(vec2 uv){
  vec2 size=vec2(textureSize(uSatelliteFootprint,0)),p=uv*size-0.5,cell=floor(p);
  vec4 wx=cloudCubicWeights(fract(p.x)),wy=cloudCubicWeights(fract(p.y));
  vec2 gx=vec2(wx.x+wx.y,wx.z+wx.w),gy=vec2(wy.x+wy.y,wy.z+wy.w);
  vec2 sx=cell.xx+vec2(-0.5,1.5)+vec2(wx.y,wx.w)/gx;
  vec2 sy=cell.yy+vec2(-0.5,1.5)+vec2(wy.y,wy.w)/gy;
  // Four hardware-linear fetches implement a full 4x4 cubic B-spline.
  // Unlike nearest-lobe selection, both value and derivatives stay continuous.
  float a=mix(textureLod(uSatelliteFootprint,vec2(sx.x,sy.x)/size,0.0).r,textureLod(uSatelliteFootprint,vec2(sx.y,sy.x)/size,0.0).r,gx.y);
  float b=mix(textureLod(uSatelliteFootprint,vec2(sx.x,sy.y)/size,0.0).r,textureLod(uSatelliteFootprint,vec2(sx.y,sy.y)/size,0.0).r,gx.y);
  return (mix(a,b,gy.y)*255.0-128.0)/127.0*${CLOUD_FOOTPRINT_RANGE.toFixed(1)}*20015.114/float(textureSize(uSatelliteCurrent,0).y);
}
float satelliteDensity(vec3 p,float h,bool fineDetail){
  vec2 uv=geographicUV(p);
  vec4 observed=textureLod(uSatelliteCurrent,uv,0.0);
  float flags=floor(observed.a*255.0+0.5),state=mod(flags,8.0);
  // The user-approved <=10 km fringe is an explicitly labelled estimate.
  // Only a field grown from usable observed columns can grant that fringe;
  // clear/unknown regions beyond it remain empty, with no global fallback.
  if(uSatelliteFootprintReady<0.5)return 0.0;
  vec4 currentColumn=textureLod(uSatelliteShapeCurrent,uv,0.0);
  if(currentColumn.a<0.5)return 0.0;
  float distanceKm=cloudFormationDistance(uv);
  if(distanceKm<=0.0)return 0.0;
  bool boundaryEstimate=state<2.5||state>4.5||mod(floor(flags/8.0),4.0)>0.5;
  if(boundaryEstimate){
    float fromObservation=cloudObservationDistance(uv);
    // Independent metric cap: smoothing cannot grow a cloud farther than the
    // authorised distance from any actual usable retrieval's rectangle.
    if(fromObservation>${CLOUD_BOUNDARY_BAND_KM.toFixed(1)})return 0.0;
    distanceKm=min(distanceKm,${CLOUD_BOUNDARY_BAND_KM.toFixed(1)}-fromObservation);
  }

  vec4 motion=textureLod(uSatelliteMotion,uv,0.0);
  vec2 metresPerSecond=(motion.rg*255.0-128.0)*2.0;
  float lat=(0.5-uv.y)*PI;
  vec2 angular=metresPerSecond/vec2(40030228.0*max(0.1,cos(lat)),40030228.0);
  vec2 beforeUV=vec2(fract(uv.x-angular.x*uObservationInterval),clamp(uv.y+angular.y*uObservationInterval,0.0,1.0));
  vec4 before=textureLod(uSatellitePrevious,beforeUV,0.0);
  float beforeFlags=floor(before.a*255.0+0.5),previousState=mod(beforeFlags,8.0);
  // Interpolate continuous properties separately, never categorical support.
  vec3 properties=currentColumn.rgb;
  if(!boundaryEstimate&&previousState>2.5&&previousState<4.5&&mod(floor(beforeFlags/8.0),4.0)<0.5)
    properties=mix(textureLod(uSatelliteShapePrevious,beforeUV,0.0).rgb,properties,uObservationBlend);

  float top=properties.b*25.5,opticalDepth=exp(properties.r*log(161.0))-1.0;
  if(opticalDepth<=0.0)return 0.0;
  float base=max(0.1,top-satelliteEstimatedThickness(top,opticalDepth));
  if(h<base||h>top||top<=base)return 0.0;
  float band=top<3.0?0.0:top<8.0?1.0:2.0;
  if((band<0.5&&uLayers.x<0.5)||(band>0.5&&band<1.5&&uLayers.y<0.5)||(band>1.5&&uLayers.z<0.5))return 0.0;

  // The mask is an eligibility constraint, NOT the silhouette. Independently
  // positioned, inscribed lobes form curved banks before 3D detail is added.
  float t=(h-base)/(top-base),depth=top-base;
  float shoulder=depth*(0.12+0.9*t*t);
  float support=smoothstep(0.0,clamp(depth*0.5,0.35,2.8),distanceKm-shoulder);
  if(support<=0.0)return 0.0;

  // This is the accepted model's internal occupancy input, NOT an observed
  // areal cloud fraction. Passing 1.0 previously filled every cell as a slab.
  // High altitude alone must not turn every opaque cloud into flat cirrus.
  float kind=top>7.0&&opticalDepth<2.0?2.0:0.0;
  vec4 column=vec4(0.58,base/25.5,top/25.5,1.0);
  // Use the original world-space appearance coordinate unchanged. Tracking
  // winds associate observations above; they do not rescale/warp the kernel.
  float shape=layerCloud(column,p,h,kind,fineDetail)/(kind>1.5?0.0015:0.25);
  // Erode the existing 3D body at the boundary, not its regional occupancy:
  // reducing occupancy re-thresholded whole banks and deleted thin patches.
  // The original internal lobes now define the irregular receding silhouette.
  shape=max(0.0,shape-(1.0-support)*1.6);
  float growth=motion.a>0.9?mix(0.2,1.0,uObservationBlend):1.0;
  // Confidence is a continuous derived property. A nearest categorical
  // strength switch otherwise leaves a visible grid seam inside the fringe.
  float confidence=clamp(properties.g,0.65,1.0);
  return support*shape*opticalDepth/(max(0.1,top-base)*CLOUD_EXTINCTION)*growth*confidence;
}
`;
