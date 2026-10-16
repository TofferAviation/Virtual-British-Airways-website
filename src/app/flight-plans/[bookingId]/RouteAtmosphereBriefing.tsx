import type { SimbriefBriefing } from "@/lib/pilot-operations-store";
import { getRouteAtmosphereBriefing, type RouteAtmosphereStation } from "@/lib/route-atmosphere-briefing";

function time(value: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(`${value.replace(/Z$/, "")}Z`));
}

function rounded(value: number | null, suffix: string) {
  return value === null ? "—" : `${Math.round(value)}${suffix}`;
}

function stationSummary(station: RouteAtmosphereStation) {
  const signals = [];
  if ((station.precipitationChancePercent ?? 0) >= 40) signals.push(`${Math.round(station.precipitationChancePercent ?? 0)}% precip.`);
  if ((station.visibilityKm ?? Number.POSITIVE_INFINITY) < 8) signals.push(`${station.visibilityKm?.toFixed(1)} km vis.`);
  if ((station.gustKt ?? 0) >= 25) signals.push(`${Math.round(station.gustKt ?? 0)} kt gusts`);
  if (!signals.length) signals.push((station.cloudCoverPercent ?? 0) >= 65 ? "Cloudy model signal" : "Quieter model signal");
  return signals.join(" · ");
}

export async function RouteAtmosphereBriefing({ briefing, originIcao, destinationIcao, date, departure, duration }: {
  briefing: SimbriefBriefing;
  originIcao: string | null;
  destinationIcao: string | null;
  date: string;
  departure: string;
  duration: string;
}) {
  const atmosphere = await getRouteAtmosphereBriefing({
    originIcao, destinationIcao,
    originLatitude: briefing.originLatitude, originLongitude: briefing.originLongitude,
    destinationLatitude: briefing.destinationLatitude, destinationLongitude: briefing.destinationLongitude,
    routePoints: briefing.routePoints, estimatedOut: briefing.estimatedOut, scheduledOut: briefing.scheduledOut,
    date, departure, duration,
  }).catch(() => null);

  if (!atmosphere) return <section className="route-atmosphere route-atmosphere-unavailable"><span className="flight-plan-label">ROUTE ATMOSPHERE</span><h2>Vertical weather view not available yet</h2><p>It opens once the forecast model covers the planned departure and the saved OFP has route coordinates. Your SimBrief OFP remains available above.</p></section>;

  const departureStation = atmosphere.stations[0];
  const arrivalStation = atmosphere.stations.at(-1)!;
  const layers = departureStation.layers;
  return <section className="route-atmosphere">
    <div className="route-atmosphere-heading"><div><span className="flight-plan-label">ROUTE ATMOSPHERE · SIMULATION PLANNING</span><h2>See the weather story around your flight.</h2><p>A modelled cross-section of the saved route at the planned time—surface signals below, changing cloud and wind structure through the air above.</p></div><span className="route-atmosphere-source">Model forecast<br /><strong>Open-Meteo</strong></span></div>
    <div className="route-atmosphere-glance">
      <article><span>DEPARTURE · {departureStation.name}</span><strong>{stationSummary(departureStation)}</strong><small>{time(departureStation.sampledAt)} UTC · wind {rounded(departureStation.windKt, " kt")} · gusts {rounded(departureStation.gustKt, " kt")}</small></article>
      <article><span>ARRIVAL · {arrivalStation.name}</span><strong>{stationSummary(arrivalStation)}</strong><small>{time(arrivalStation.sampledAt)} UTC · wind {rounded(arrivalStation.windKt, " kt")} · gusts {rounded(arrivalStation.gustKt, " kt")}</small></article>
      <article><span>FREEZING LEVEL</span><strong>{rounded(arrivalStation.freezingLevelFt, " ft")}</strong><small>Modelled at arrival · compare with the complete OFP</small></article>
    </div>
    <div className="route-atmosphere-surface" aria-label="Surface weather signals along the route">{atmosphere.stations.map((station, index) => <article key={`${station.label}:${station.name}:${index}`}><span>{station.label}</span><strong>{station.name}</strong><dl><div><dt>Cloud</dt><dd>{rounded(station.cloudCoverPercent, "%")}</dd></div><div><dt>Precip.</dt><dd>{rounded(station.precipitationChancePercent, "%")}</dd></div><div><dt>Visibility</dt><dd>{station.visibilityKm === null ? "—" : `${station.visibilityKm.toFixed(1)} km`}</dd></div></dl></article>)}</div>
    <div className="route-atmosphere-section-heading"><div><h3>Vertical atmosphere</h3><p>Each block combines the model’s cloud-cover and humidity signals. Numbers show wind speed / relative humidity at that pressure level.</p></div><span>Forecast departure {time(atmosphere.requestedDeparture)} UTC</span></div>
    <div className="route-atmosphere-matrix" role="table" aria-label="Modelled vertical atmosphere along the planned route">
      <div className="route-atmosphere-row route-atmosphere-header" role="row"><span role="columnheader">Pressure</span>{atmosphere.stations.map((station, index) => <span role="columnheader" key={`${station.name}:${index}`}>{station.name}</span>)}</div>
      {layers.map((layer, layerIndex) => <div className="route-atmosphere-row" role="row" key={layer.hPa}><span className="route-atmosphere-level" role="rowheader"><strong>{layer.hPa} hPa</strong><small>{layer.label}</small></span>{atmosphere.stations.map((station, stationIndex) => {
        const reading = station.layers[layerIndex];
        const density = Math.min(1, Math.max(0.12, Math.max(reading.cloudCoverPercent ?? 0, reading.humidityPercent ?? 0) / 100));
        return <div className="route-atmosphere-cell" role="cell" key={`${station.name}:${reading.hPa}:${stationIndex}`}><i style={{ opacity: density }} aria-hidden="true" /><span>{rounded(reading.windKt, " kt")} / {rounded(reading.humidityPercent, "%")}</span><small>{reading.temperatureC === null ? "—" : `${Math.round(reading.temperatureC)}°C`}</small></div>;
      })}</div>)}
    </div>
    <p className="route-atmosphere-foot"><strong>Keep the sources in their lane.</strong> This is an automatically sampled forecast for virtual-flight planning, not a certified briefing or live weather observation. Use the synced SimBrief OFP, airport weather, NOTAMs and your simulator’s weather setting for the final flight setup.</p>
  </section>;
}
