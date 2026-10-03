import type { FleetAircraftSectorMilestone, FleetAircraftTimelineEvent } from "@/lib/fleet-service";

type Props = { events: FleetAircraftTimelineEvent[]; sectorMilestones: FleetAircraftSectorMilestone[] };

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed);
}

export function AircraftHistoryTimeline({ events, sectorMilestones }: Props) {
  return <section className="fleet-aircraft-panel fleet-aircraft-panel-wide">
    <div className="fleet-aircraft-panel-heading"><div><span className="fleet-profile-kicker">AIRCRAFT PASSPORT</span><h2>Airframe milestones</h2></div><small>Generated from BAV Fleet records</small></div>
    <div className="fleet-aircraft-milestones">{sectorMilestones.map((milestone) => <div key={milestone.target} className={milestone.achievedAt ? "achieved" : "pending"}><strong>{milestone.target.toLocaleString("en-GB")}</strong><span>{milestone.label.replace(/^\d[\d,]* /, "")}</span><small>{milestone.achievedAt ? `${formatDate(milestone.achievedAt)}${milestone.flightReference ? ` · ${milestone.flightReference}` : ""}` : "Not yet reached"}</small></div>)}</div>
    {events.length ? <ol className="fleet-aircraft-timeline">{events.map((event) => <li key={event.id}><time>{formatDate(event.occurredAt)}</time><div><span>{event.kind}</span><strong>{event.title}</strong><p>{event.detail}</p></div></li>)}</ol> : <p className="fleet-aircraft-clear">Aircraft history will appear as BAV Fleet events are recorded.</p>}
  </section>;
}
