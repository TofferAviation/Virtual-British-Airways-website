/** Development-page-only synthetic flight; never imported by the live tracker. */
import type { PublicRadarFlight, PublicRadarSnapshot } from "@/lib/radar-live";

const route = [[51.47,-.46,83],[51.7,-.8,6000],[52.1,-1.3,15000],[52.7,-2,26000],[53.3,-2.7,33000],[53.75,-3.1,36000]];
const snapshots: PublicRadarSnapshot[]=route.map(([latitude,longitude,altitudeFt],i)=>({
  latitude,longitude,altitudeFt,timestamp:new Date(Date.UTC(2026,2,20,12,i*5)).toISOString(),
  headingDeg:0,groundSpeedKt:450,indicatedAirspeedKt:null,trueAirspeedKt:null,squawk:null,
  beaconOn:true,enginesRunning:true,onGround:i===0,verticalSpeedFpm:0,detectedAirport:null,diversionAirport:null,
}));
export const TRAFFIC_FIXTURE: PublicRadarFlight[]=[{
  id:"qa-a380",flightNumber:"SYNTHETIC",callsign:"QA A380",from:"LHR",to:"SFO",aircraft:"Airbus A380-800",registration:null,aircraftImage:null,
  simulator:"msfs2024",updatedAt:snapshots.at(-1)!.timestamp,distanceNm:200,connectionHealthy:true,diversionAirport:null,
  lastSnapshot:snapshots.at(-1)!,recentSnapshots:snapshots,trackSnapshots:snapshots,plannedRoute:null,journeyProgress:null,weatherStations:[],
}];

// Different real model keys at ordinary map scale, never injected into live data.
const base=TRAFFIC_FIXTURE[0];
for(const [id,aircraft,latitude,longitude,altitudeFt,headingDeg]of [
  ["qa-a320","Airbus A320",53.35,-2.4,29000,110],
  ["qa-b789","Boeing 787-9",53.1,-3.7,38000,235],
  ["qa-b773","Boeing 777-300ER",52.7,-1.7,35000,35],
  ["qa-a359","Airbus A350-900",52.4,-3,39000,290],
] as const){
  const position={...base.lastSnapshot!,latitude,longitude,altitudeFt,headingDeg};
  TRAFFIC_FIXTURE.push({...base,id,callsign:`QA ${id.slice(3).toUpperCase()}`,aircraft,lastSnapshot:position,recentSnapshots:[position],trackSnapshots:[position],plannedRoute:null});
}
