import assert from "node:assert/strict";
import test from "node:test";
import {AircraftMotion,AIRCRAFT_PLAYBACK_DELAY_MS} from "./radar-aircraft-motion.ts";

const utc=Date.parse("2026-10-24T12:00:00Z");
const report=(seconds,overrides={})=>({timestamp:new Date(utc+seconds*1000).toISOString(),latitude:53+seconds*.002,longitude:-3,altitudeFt:36000+seconds*20,headingDeg:45,...overrides});
const history=Array.from({length:7},(_,i)=>report((i-6)*5));
const close=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<(typeof tolerance==="number"?tolerance:1e-9),typeof tolerance==="string"?tolerance:`${a} != ${b}`);

test("sparse five-second reports animate continuously at measured speed despite polling jitter",()=>{
  assert.equal(AIRCRAFT_PLAYBACK_DELAY_MS,15000);
  const motion=new AircraftMotion();motion.sync(report(0),history,0,utc);
  const arrivals=[5.7,10.1,15.9,20.3,26.2,30.8,35.4,40.2];let index=0,last=motion.sample(0).latitude;
  const original=JSON.stringify(history);
  for(let frame=1;frame<=40*60;frame++){
    const seconds=frame/60;
    if(seconds>=arrivals[index]){motion.sync(report((index+1)*5),[],seconds*1000,utc+seconds*1000);index++;}
    const pose=motion.sample(seconds*1000);
    close(pose.latitude,53+(seconds-15)*.002);
    close(pose.latitude-last,.002/60);last=pose.latitude;
    close(pose.altitudeFt,36000+(seconds-15)*20,1e-6);
  }
  assert.equal(JSON.stringify(history),original,"source/recorded telemetry stays unmodified");
});

test("motion is frame-rate independent at 30, 60 and 144 fps",()=>{
  const poses=[];
  for(const fps of [30,60,144]){
    const motion=new AircraftMotion();motion.sync(report(0),history,0,utc);
    for(let frame=1;frame<=12*fps;frame++){
      const now=frame/fps*1000;
      if(frame===5*fps||frame===10*fps)motion.sync(report(now/1000),[],now,utc+now);
      motion.sample(now);
    }
    poses.push({...motion.sample(12000)});
  }
  for(const pose of poses){close(pose.latitude,53-.006);close(pose.altitudeFt,35940,1e-6);}
});

test("heading and position take the short way across north and the dateline; height stays between reports",()=>{
  const a=report(-20,{latitude:0,longitude:179.999,headingDeg:359,altitudeFt:10000}),b=report(-10,{latitude:0,longitude:-179.999,headingDeg:1,altitudeFt:12000});
  const motion=new AircraftMotion();motion.sync(b,[a,b],0,utc);
  const mid=motion.sample(0);close(Math.abs(mid.longitude),180);close(mid.headingDeg,0);close(mid.altitudeFt,11000);
  const end=motion.sample(5000);close(end.longitude,-179.999);close(end.headingDeg,1);close(end.altitudeFt,12000);
});

test("duplicate / out-of-order reports and selection refreshes cannot rewind or restart motion",()=>{
  const motion=new AircraftMotion();motion.sync(report(0),history,0,utc);motion.sample(1000);
  motion.sync(report(0),history,1000,utc+1000);
  motion.sync(report(-5,{latitude:10}),[],1100,utc+1100);
  close(motion.sample(2000).latitude,53-.026);
});

test("missing updates stop at the last measured pose, then resume without snapping on a late packet",()=>{
  const motion=new AircraftMotion();motion.sync(report(0),history,0,utc);
  for(let now=1000;now<=20000;now+=1000)motion.sample(now);
  close(motion.sample(20000).latitude,53);
  motion.sync(report(20),[],20000,utc+20000);
  close(motion.sample(20000).latitude,53,"packet arrival doesn't teleport the model");
  const next=motion.sample(20016);assert.ok(next.latitude>53&&next.latitude<53.00004);
  for(let now=21000;now<=120000;now+=1000)motion.sample(now);
  close(motion.sample(120000).latitude,report(20).latitude);
});

test("parked aircraft never drift; first/old/timestampless reports appear immediately",()=>{
  const motion=new AircraftMotion(),p=report(0,{latitude:51.47,altitudeFt:0,headingDeg:0});
  motion.sync(p,[-20,-10,0].map(s=>({...p,timestamp:report(s).timestamp})),0,utc);
  for(let now=0;now<30000;now+=16){close(motion.sample(now).latitude,51.47);close(motion.sample(now).altitudeFt,0);}
  const lone=new AircraftMotion();lone.sync(report(0),[],0,utc);close(lone.sample(0).latitude,53);
  const stale=new AircraftMotion();stale.sync(report(0),history,0,utc+120000);close(stale.sample(0).latitude,53);
  const direct=new AircraftMotion();direct.sync({...p,timestamp:undefined},[],0,utc);close(direct.sample(60000).latitude,51.47);
  const skewed=new AircraftMotion();skewed.sync(report(500),[],0,utc);close(skewed.sample(0).latitude,report(500).latitude);
});

test("teleports / long reconnects reset safely, invalid packets are ignored, replay scrubs remain immediate",()=>{
  const motion=new AircraftMotion();motion.sync(report(0),history,0,utc);
  motion.sync(report(5,{latitude:-33,longitude:151}),[],5000,utc+5000);
  close(motion.sample(5000).latitude,-33);
  motion.sync(report(10,{latitude:NaN}),[],10000,utc+10000);close(motion.sample(10000).latitude,-33);
  motion.sync(report(500,{latitude:20}),[],11000,utc+11000);close(motion.sample(11000).latitude,-33,"future clock rejected");
  motion.sync(report(90),[],90000,utc+90000);close(motion.sample(90000).latitude,report(90).latitude);
  motion.sync(report(-10),history,90001,utc+90001,true);close(motion.sample(90001).latitude,report(-10).latitude);
  motion.sync(report(-20),history,90002,utc+90002,true);close(motion.sample(90002).latitude,report(-20).latitude);
});

test("background-tab recovery is bounded and cannot reverse playback",()=>{
  const motion=new AircraftMotion();motion.sync(report(0),history,0,utc);
  close(motion.sample(10000).latitude,53-.01);
  close(motion.sample(60000).latitude,53);
  close(motion.sample(30000).latitude,53);
});
