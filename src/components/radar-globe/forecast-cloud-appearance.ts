/** Estimated sub-grid cloud interiors for GLOBAL FORECAST mode only.
 * Model layer cover/pressure bounds are inputs, not observed cloud geometry.
 * Rounded cumulus shoulders, merged stratocumulus decks and thin high fibres
 * share the existing optical lighting, shadows, mip filtering and frame cache. */
export const FORECAST_CLOUD_REVISION="forecast-billows-v1.1";
export const forecastCloudAppearanceGLSL=`
float forecastLayerCloud(vec4 sampleValue,vec3 p,float h,float kind,bool fineDetail){
  if(sampleValue.a<0.01)return 0.0;
  // Normalise continuous properties by validity, rather than blending a
  // missing zero-height cell into a steep wall at the edge of valid data.
  vec3 w=sampleValue.rgb/max(0.01,sampleValue.a);
  float coverage=clamp(w.r,0.0,1.0),base=w.g*25.5,top=w.b*25.5;
  if(coverage<0.008||top<=base+0.1||h<base||h>top)return 0.0;
  float t=(h-base)/(top-base),depth=top-base;
  vec3 normal=ellipsoidNormal(p),foot=p-normal*h;
  vec4 regional=cloudNoise(uBaseNoise,foot/72.0+kind*0.37,72.0,p);
  float organisation=smoothstep(0.26,0.74,regional.r);
  // Areal cover is not a filled-volume fraction. Nonlinear calibration and
  // coherent organisation preserve open channels and individual rising lobes
  // at broken cover instead of saturating every point into a white blanket.
  float cover=clamp(coverage*coverage+(organisation-0.5)*0.65+(regional.g-0.5)*0.25,0.0,1.0);
  float threshold=mix(0.84,0.31,cover);
  if(kind>1.5){
    float fibres=cloudNoise(uBaseNoise,(foot+normal*h*6.0)/vec3(180.0,35.0,65.0),35.0,p).r;
    float profile=smoothstep(0.0,0.08,t)*(1.0-smoothstep(0.40,1.0,t));
    return smoothstep(threshold,threshold+0.16,fibres)*profile*0.003*sqrt(coverage)*sampleValue.a;
  }
  float scale=mix(4.8,11.0,kind);
  vec3 volume=p+normal*(h-base)*kind*0.7+regional.gba*1.8;
  vec4 mass=cloudNoise(uBaseNoise,volume/scale+kind*0.53,scale,p);
  // Broad, coherent domes determine the canopy. Fine erosion only trims its
  // edges; it does not turn the whole deck into uniformly sized white grains.
  float updraft=smoothstep(0.32,0.74,mass.r*0.7+regional.g*0.3);
  float canopy=mix(0.32,1.0,updraft);
  float deck=smoothstep(0.80,0.98,coverage)*(1.0-smoothstep(2.2,4.5,depth));
  canopy=mix(canopy,0.84+mass.r*0.12,deck);
  float profile=smoothstep(0.0,0.055,t)*(1.0-smoothstep(max(0.1,canopy-0.18),canopy,t));
  if(profile<=0.0)return 0.0;
  float shape=dot(mass,vec4(0.25,0.40,0.25,0.10))+0.14-t*t*0.16;
  shape=mix(shape,max(shape,threshold+0.13),deck*(1.0-smoothstep(0.45,0.85,t))*0.65);
  float margin=shape-threshold;
  if(margin<=0.0)return 0.0;
  float erosion=0.045;
  if(fineDetail&&margin<0.20){
    vec4 detail=cloudNoise(uDetailNoise,volume/1.25+kind*0.29,1.25,p);
    erosion=(1.0-dot(detail.gba,vec3(0.625,0.25,0.125)))*0.095;
  }
  float body=smoothstep(threshold,threshold+0.10,shape-erosion)*profile;
  return body*(0.12+0.16*sqrt(coverage))*sqrt(coverage)*sampleValue.a;
}
float forecastDensity(vec3 p,float h,bool fineDetail){
  vec2 uv=geographicUV(p);
  vec4 low=weatherAt(uLowWeather,uv),middle=weatherAt(uMiddleWeather,uv),high=weatherAt(uHighWeather,uv);
  vec4 column=vec4(0.0);float kind=0.0;
  // GFS pressure layers are normally vertically separate. If their averaged
  // bounds overlap, use the dominant model fraction at this height, not a sum
  // that counts the same moist volume twice. One noise tree per density probe
  // also avoids triplicating it through every secondary illumination ray.
  if(uLayers.x>0.5&&low.a>0.01&&h>=low.g/low.a*25.5&&h<=low.b/low.a*25.5)column=low;
  if(uLayers.y>0.5&&middle.a>0.01&&h>=middle.g/middle.a*25.5&&h<=middle.b/middle.a*25.5&&middle.r>column.r){column=middle;kind=1.0;}
  if(uLayers.z>0.5&&high.a>0.01&&h>=high.g/high.a*25.5&&h<=high.b/high.a*25.5&&high.r>column.r){column=high;kind=2.0;}
  return forecastLayerCloud(column,p,h,kind,fineDetail);
}
`;
