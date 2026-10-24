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
