import Link from "next/link";
import { AllianceShell } from "@/components/AllianceShell";
import { requirePilotSession } from "@/lib/pilot-auth";
import { allianceReadiness, getAllianceConfiguration, getAllianceSchedules } from "@/lib/alliance-store";
import { carrierEligible, scheduleAvailable, secondsDisplay } from "@/lib/alliance";
import { getActivePilotBooking } from "@/lib/pilot-operations-store";
import { bookAlliance } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "oneworld Operations · BA Virtual" };
export default async function AllianceOperations({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requirePilotSession(), query = await searchParams;
  const value = (name: string) => typeof query[name] === "string" ? query[name] as string : "";
  const today = new Date().toISOString().slice(0, 10), date = /^\d{4}-\d{2}-\d{2}$/.test(value("date")) ? value("date") : today;
  const ready = await allianceReadiness();
  if (!ready.ready) return <AllianceShell title="oneworld Operations" intro="Explore partner operations through your existing BA Virtual identity."><div className="alliance-notice">Alliance Operations is awaiting database setup. Your BA bookings and career remain available.</div></AllianceShell>;
  const [{ carriers, settings }, schedules, active] = await Promise.all([getAllianceConfiguration(date), getAllianceSchedules(), getActivePilotBooking(session.pilotId)]);
  const candidates = schedules.filter(s => scheduleAvailable(s, date) && carriers.some(c => c.id === s.operatorId && carrierEligible(c, date)));
  const routes = candidates.filter(s => {
    const searchable = [s.flightNumber, s.callsign, s.aircraft, s.origin, s.destination, s.originCountry, s.destinationCountry, s.region].join(" ").toLowerCase();
    if (value("q") && !searchable.includes(value("q").toLowerCase())) return false;
    if (value("carrier") && s.operatorId !== value("carrier")) return false;
    if (value("origin") && ![s.origin, s.originIata].includes(value("origin").toUpperCase())) return false;
    if (value("destination") && ![s.destination, s.destinationIata].includes(value("destination").toUpperCase())) return false;
    if (value("aircraft") && s.aircraftIcao !== value("aircraft")) return false;
    if (value("maxDistance") && s.distanceNm > Number(value("maxDistance"))) return false;
    if (value("maxHours") && s.blockSeconds > Number(value("maxHours")) * 3600) return false;
    if (value("departureFrom") && s.departure < value("departureFrom")) return false;
    if (value("departureUntil") && s.departure > value("departureUntil")) return false;
    const kind = s.originCountry === s.destinationCountry ? "domestic" : s.blockSeconds >= 21600 ? "long-haul" : "regional";
    return !value("kind") || value("kind") === kind;
  });
  return <AllianceShell title="oneworld Operations" intro="Choose an operating airline, explore its approved timetable and dispatch your next sector. One flight earns BA career credit and an airline bank entry under the published policy.">
    {!settings.enabled ? <div className="alliance-notice">Operations is in preparation. Timetables can be reviewed here; partner booking will open when Operations enables the programme.</div> : null}
    {value("error") ? <div role="alert" className="alliance-notice error">{value("error")}</div> : null}
    {active ? <div className="alliance-notice">You have an active flight: <Link href={`/flight-plans/${active.id}`}>{active.flightNumber} · {active.from} → {active.to}</Link>. Complete or cancel it before choosing another.</div> : null}
    <form className="alliance-filters" method="get">
      <label>Operating airline<select name="carrier" defaultValue={value("carrier")}><option value="">All eligible airlines</option>{carriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Flight date · UTC<input name="date" type="date" required defaultValue={date} /></label>
      <label>Origin · IATA / ICAO<input name="origin" maxLength={4} defaultValue={value("origin")} placeholder="LHR or EGLL" /></label>
      <label>Destination · IATA / ICAO<input name="destination" maxLength={4} defaultValue={value("destination")} /></label>
      <label>Flight, callsign, country or region<input name="q" defaultValue={value("q")} /></label>
      <label>Aircraft<select name="aircraft" defaultValue={value("aircraft")}><option value="">All types</option>{[...new Set(schedules.map(s => s.aircraftIcao))].sort().map(a => <option key={a}>{a}</option>)}</select></label>
      <label>Sector<select name="kind" defaultValue={value("kind")}><option value="">All sectors</option><option value="domestic">Domestic</option><option value="regional">International / regional</option><option value="long-haul">Long haul · 6h+</option></select></label>
      <label>Maximum distance · NM<input type="number" name="maxDistance" min="1" max="15000" defaultValue={value("maxDistance")} /></label>
      <label>Maximum block hours<input type="number" name="maxHours" min="0.1" max="48" step="0.1" defaultValue={value("maxHours")} /></label>
      <label>Departs after · UTC<input type="time" name="departureFrom" defaultValue={value("departureFrom")} /></label>
      <label>Departs before · UTC<input type="time" name="departureUntil" defaultValue={value("departureUntil")} /></label>
      <button className="button button-primary" type="submit">Find flights</button>
    </form>
    <p>{routes.length} matching service{routes.length === 1 ? "" : "s"} · all schedule times UTC. Estimated bank credit uses scheduled block time; only validated, approved time is credited.</p>
    {!schedules.length ? <div className="alliance-empty"><h2>Timetable awaiting an approved import</h2><p>Operations can load permissioned partner schedules in the <Link href="/staff/alliance">Alliance Manager</Link>. Real, historical, manual and virtual schedules are labelled separately. No flight numbers or departure times have been invented.</p><Link href="/book">Browse the existing BA network</Link></div> : !routes.length ? <div className="alliance-empty">No approved services match these filters and the selected date.</div> : <div className="alliance-routes">{routes.slice(0, 60).map(s => <article className="alliance-route" key={s.id}><div><span className="alliance-label">{carriers.find(c => c.id === s.operatorId)?.name}</span><span className="alliance-badge">{s.sourceType === "verified" ? "Source verified" : `${s.sourceType} schedule`}</span><h2>{s.originIata} → {s.destinationIata} · {s.flightNumber}</h2><p>{s.aircraft} · {s.callsign} · {s.departure}–{s.arrival} UTC · {secondsDisplay(s.blockSeconds)} · {s.distanceNm.toLocaleString()} NM</p><p>Estimated airline bank +{secondsDisplay(s.blockSeconds)} · BA career {settings.policy.career ? `+${secondsDisplay(s.blockSeconds)}` : "not credited under this policy"}</p>{s.marketingCarrierId !== s.operatorId ? <small>Marketed by {carriers.find(c => c.id === s.marketingCarrierId)?.name}; operated by {carriers.find(c => c.id === s.operatorId)?.name}. Credit follows the operator.</small> : null}<small><a href={s.sourceUrl} rel="noopener noreferrer" target="_blank">Timetable source</a> · confidence {s.confidence} · verified {new Date(s.verifiedAt).toLocaleDateString("en-GB")} · valid {s.validFrom} to {s.validUntil}</small></div><form action={bookAlliance}><input type="hidden" name="scheduleId" value={s.id} /><input type="hidden" name="date" value={date} /><button className="button button-primary" disabled={!settings.enabled || Boolean(active)}>Select and dispatch</button></form></article>)}</div>}
    {routes.length > 60 ? <p>Showing the first 60 results. Narrow your filters to see a specific service.</p> : null}
  </AllianceShell>;
}
