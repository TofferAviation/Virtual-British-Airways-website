import type { SimbriefBriefing } from "@/lib/pilot-operations-store";
import { toBritishAirwaysCallsign } from "@/lib/ba-flight-identifiers";
import { RouteWindBriefing } from "./RouteWindBriefing";

type Detail = { label: string; value: string | null };

function DetailList({ items }: { items: Detail[] }) {
  const available = items.filter((item) => item.value);
  if (!available.length) return <p className="briefing-empty">Not included in this OFP.</p>;
  return <dl className="briefing-details">{available.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}

function formatTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date).replace(",", "") + " UTC";
}

function formatDuration(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 600) return value;
  return `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;
}

function formatKg(value: string | null) {
  if (!value) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? `${amount.toLocaleString("en-GB")} kg` : value;
}

export function FlightPlanBriefing({ briefing, route, cruiseAltitude, alternate, ofpUrl, originIcao, destinationIcao, date, departure, duration }: {
  briefing: SimbriefBriefing;
  route: string | null;
  cruiseAltitude: string | null;
  alternate: string | null;
  ofpUrl: string | null;
  originIcao: string | null;
  destinationIcao: string | null;
  date: string;
  departure: string;
  duration: string;
}) {
  const title = [briefing.airline, briefing.flightNumber].filter(Boolean).join(" ") || "SimBrief operational briefing";

  return <section className="flight-plan-card simbrief-briefing">
    <span className="flight-plan-label">SAVED SIMBRIEF BRIEFING</span>
    <h2>{title}</h2>
    <p className="briefing-intro">This briefing was copied to your BAV assignment when the OFP was synced. It remains available here while you prepare and fly the service.</p>
    <div className="briefing-grid">
      <section><h3>Flight & timing</h3><DetailList items={[
        { label: "Callsign", value: briefing.callsign ? toBritishAirwaysCallsign(briefing.callsign) : null }, { label: "Aircraft", value: [briefing.aircraft, briefing.aircraftIcao].filter(Boolean).join(" · ") || null },
        { label: "AIRAC", value: briefing.airac }, { label: "Scheduled off-block", value: formatTime(briefing.scheduledOut) },
        { label: "Scheduled in-block", value: formatTime(briefing.scheduledIn) }, { label: "Estimated off-block", value: formatTime(briefing.estimatedOut) },
        { label: "Estimated in-block", value: formatTime(briefing.estimatedIn) }, { label: "Block time", value: formatDuration(briefing.blockTime) },
        { label: "En-route time", value: formatDuration(briefing.enrouteTime) },
      ]} /></section>
      <section><h3>Route & load</h3><DetailList items={[
        { label: "Route", value: route }, { label: "Initial cruise", value: cruiseAltitude }, { label: "Alternate", value: alternate },
        { label: "Route distance", value: briefing.distanceNm ? `${briefing.distanceNm} nm` : null }, { label: "Cost index", value: briefing.costIndex },
        { label: "Passengers", value: briefing.passengerCount }, { label: "Cargo", value: formatKg(briefing.cargoWeight) },
      ]} /></section>
      <section><h3>Fuel plan</h3><DetailList items={[
        { label: "Taxi", value: formatKg(briefing.taxiFuel) }, { label: "Trip", value: formatKg(briefing.tripFuel) },
        { label: "Contingency", value: formatKg(briefing.contingencyFuel) }, { label: "Alternate", value: formatKg(briefing.alternateFuel) },
        { label: "Reserve", value: formatKg(briefing.reserveFuel) }, { label: "Extra", value: formatKg(briefing.extraFuel) },
        { label: "Block fuel", value: formatKg(briefing.blockFuel) },
      ]} /></section>
    </div>
    <div className="briefing-weather"><section><h3>Departure weather</h3><p><strong>{briefing.originName ?? "Departure airport"}</strong>{briefing.originRunway ? ` · planned runway ${briefing.originRunway}` : ""}</p><code>{briefing.originMetar ?? "Weather was not included in this OFP."}</code></section><section><h3>Arrival weather</h3><p><strong>{briefing.destinationName ?? "Arrival airport"}</strong>{briefing.destinationRunway ? ` · planned runway ${briefing.destinationRunway}` : ""}</p><code>{briefing.destinationMetar ?? "Weather was not included in this OFP."}</code></section>{briefing.alternateName || briefing.alternateMetar ? <section><h3>Alternate weather</h3><p><strong>{briefing.alternateName ?? "Alternate airport"}</strong></p><code>{briefing.alternateMetar ?? "Weather was not included in this OFP."}</code></section> : null}</div>
    <RouteWindBriefing briefing={briefing} originIcao={originIcao} destinationIcao={destinationIcao} cruiseAltitude={cruiseAltitude} date={date} departure={departure} duration={duration} />
    {ofpUrl ? <details className="briefing-document"><summary>View the complete OFP without leaving BAV</summary><iframe title="Complete SimBrief operational flight plan" src={ofpUrl} loading="lazy" /><p>If the embedded document is unavailable in your browser, <a className="ops-inline-link" href={ofpUrl} target="_blank" rel="noreferrer">open the OFP in a new tab ↗</a>.</p></details> : null}
  </section>;
}
