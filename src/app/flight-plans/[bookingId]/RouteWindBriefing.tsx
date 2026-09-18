import type { SimbriefBriefing } from "@/lib/pilot-operations-store";
import { getRouteWindBriefing } from "@/lib/route-wind-briefing";

function signed(value: number) { return `${value >= 0 ? "+" : "−"}${Math.round(Math.abs(value))}`; }

export async function RouteWindBriefing({ briefing, originIcao, destinationIcao, cruiseAltitude, date, departure, duration }: {
  briefing: SimbriefBriefing;
  originIcao: string | null;
  destinationIcao: string | null;
  cruiseAltitude: string | null;
  date: string;
  departure: string;
  duration: string;
}) {
  const wind = await getRouteWindBriefing({
    originIcao, destinationIcao,
    originLatitude: briefing.originLatitude, originLongitude: briefing.originLongitude,
    destinationLatitude: briefing.destinationLatitude, destinationLongitude: briefing.destinationLongitude,
    routePoints: briefing.routePoints,
    cruiseAltitude, estimatedOut: briefing.estimatedOut, scheduledOut: briefing.scheduledOut,
    date, departure, duration,
  }).catch(() => null);

  if (!wind) return <section className="route-wind-briefing route-wind-unavailable"><span className="flight-plan-label">ROUTE WIND BRIEFING</span><h2>Cruise-level wind forecast unavailable</h2><p>Route winds are published once the model forecast covers your planned departure. Until then, use the weather and wind section in the latest SimBrief OFP as the dispatch source.</p></section>;

  const flightLevel = Math.round(wind.cruiseAltitudeFt / 100);
  const tailwindLabel = wind.averageTailwindKt >= 0 ? "Average tailwind" : "Average headwind";
  return <section className="route-wind-briefing">
    <div className="route-wind-heading"><div><span className="flight-plan-label">ROUTE WIND BRIEFING</span><h2>Flight-level winds from departure to arrival</h2><p>Modelled along the saved SimBrief route corridor at FL{flightLevel}, using the closest available {wind.pressureLevel} hPa wind layer.</p></div><span className="route-wind-level">FL{flightLevel}<small>{wind.pressureLevel} hPa</small></span></div>
    <div className="route-wind-stats"><div><span>{tailwindLabel}</span><strong>{signed(wind.averageTailwindKt)} kt</strong></div><div><span>Strongest sampled wind</span><strong>{Math.round(wind.strongestWindKt)} kt</strong></div><div><span>Forecast departure</span><strong>{new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(wind.requestedDeparture))} UTC</strong></div></div>
    <div className="route-wind-points">{wind.points.map((point, index) => <div className="route-wind-point" key={`${point.label}:${index}`}><span>{point.label}</span><strong>{point.name}</strong><b style={{ transform: `rotate(${Math.round((point.directionDeg + 180) % 360)}deg)` }} aria-label={`Wind from ${Math.round(point.directionDeg)} degrees`}>➤</b><em>{Math.round(point.directionDeg).toString().padStart(3, "0")}° / {Math.round(point.speedKt)} kt</em><small>{point.tailwindKt >= 0 ? `${signed(point.tailwindKt)} kt tailwind` : `${signed(point.tailwindKt)} kt headwind`}</small></div>)}</div>
    <p className="route-wind-foot">Forecast guidance for flight simulation only. It is sampled along the route corridor at the selected cruise level, not a replacement for the complete SimBrief OFP, NOTAMs or live pilot weather checks.</p>
  </section>;
}
