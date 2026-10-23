import assert from "node:assert/strict";
import test from "node:test";
import {auroraPhotoUniforms,resetAuroraPhoto,auroraPhotoEmission} from "./radar-aurora-photo.ts";

test("manual colours are opt-in, finite and bounded; disabling keeps choices but sends neutral GPU gains",()=>{
  assert.deepEqual(auroraPhotoUniforms({}),{enabled:false,gains:[1,1,1,1]});
  const settings={photoMode:true,colourGains:{green:0,red:4,violet:2,blue:.35}};
  assert.deepEqual(auroraPhotoUniforms(settings),{enabled:true,gains:[0,4,2,.35]});
  assert.deepEqual(auroraPhotoUniforms({...settings,photoMode:false}),{enabled:false,gains:[1,1,1,1]});
  assert.deepEqual(settings.colourGains,{green:0,red:4,violet:2,blue:.35});
  assert.deepEqual(auroraPhotoUniforms({photoMode:true,colourGains:{green:-2,red:99,violet:NaN,blue:Infinity}}).gains,[0,4,1,1]);
});
test("reset only changes screenshot options, not accepted motion, shape, exposure, forecast or camera settings",()=>{
  const settings={photoMode:true,colourGains:{green:4,red:0,violet:3,blue:2},animationSpeed:1,brightness:1.3,activity:1.1,quality:"low",hemisphere:"south",camera:{altitude:10},forecast:"live"};
  const reset=resetAuroraPhoto(settings);
  assert.equal(reset.photoMode,false);assert.deepEqual(reset.colourGains,{green:1,red:1,violet:1,blue:1});
  for(const key of ["animationSpeed","brightness","activity","quality","hemisphere","camera","forecast"])assert.equal(reset[key],settings[key]);
  assert.equal(settings.photoMode,true,"reset must not mutate current settings");
});
test("neutral colour split retains the original emission; each manual channel is non-negative and independent",()=>{
  const body=.7,hem=.4,red=.13,nitrogen=.08;
  const original=[.19*body+.35*hem+.85*red+.46*nitrogen,.85*body+hem+.035*red+.10*nitrogen,.39*body+.57*hem+.055*red+.8*nitrogen];
  const neutral=auroraPhotoEmission(body,hem,red,nitrogen,[1,1,1,1]);
  original.forEach((v,i)=>assert.ok(Math.abs(v-neutral[i])<1e-12));
  assert.deepEqual(auroraPhotoEmission(body,hem,red,nitrogen,[0,0,0,0]),[0,0,0]);
  const channels=[0,1,2,3].map(c=>auroraPhotoEmission(body,hem,red,nitrogen,[0,1,2,3].map(i=>Number(i===c))));
  assert.ok(channels.every(c=>c.every(v=>Number.isFinite(v)&&v>=0)&&c.some(v=>v>0)));
  assert.ok(channels[3][2]>channels[3][0],"blue control is not a second green gain");
  for(let c=0;c<3;c++)assert.ok(Math.abs(channels.reduce((sum,v)=>sum+v[c],0)-original[c])<1e-12);
});
