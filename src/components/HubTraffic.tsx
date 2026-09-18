import Link from "next/link";
import type { BavHubTraffic } from "@/lib/hub-traffic";

export function HubTraffic({ hubs, selectedHub }: { hubs: BavHubTraffic[]; selectedHub: string }) {
  const maxActivity = Math.max(1, ...hubs.map((hub) => hub.activityScore));

  return (
    <section className="hub-traffic-section" aria-labelledby="hub-traffic-title">
      <div className="hub-traffic-heading">
        <div>
          <span className="section-kicker">BAV home hubs</span>
          <h2 id="hub-traffic-title">Choose where your BAV journey begins</h2>
          <p>Set a home hub for quicker planning, or browse its current virtual services. The traffic figures show actual BAV activity, not public airport passenger totals.</p>
        </div>
        <Link className="button button-outline" href="/account/profile">Set my home hub</Link>
      </div>
      <div className="hub-traffic-grid">
        {hubs.map((hub) => {
          const width = Math.round((hub.activityScore / maxActivity) * 100);
          const isHomeHub = hub.code === selectedHub;
          return (
            <article className={`hub-traffic-card${isHomeHub ? " is-home-hub" : ""}`} key={hub.code}>
              <div className="hub-traffic-card-top">
                <div><span>{hub.code}</span><h3>{hub.name}</h3></div>
                {isHomeHub ? <strong>YOUR HUB</strong> : null}
              </div>
              <p>{hub.role} · {hub.description}</p>
              <div className="hub-traffic-stats">
                <div><strong>{hub.activeRoutes}</strong><span>active routes</span></div>
                <div><strong>{hub.completedDepartures}</strong><span>BAV departures</span></div>
                <div><strong>{hub.pilotsFlying}</strong><span>pilots flying now</span></div>
              </div>
              <div className="hub-traffic-bar" aria-label={`${hub.name} BAV activity: ${hub.activityScore}`}><i style={{ width: `${width}%` }} /></div>
              <Link href={`/book?hub=${hub.code}`} className="hub-traffic-link">Browse flights from {hub.code} →</Link>
            </article>
          );
        })}
      </div>
      <p className="hub-traffic-footnote">The virtual hub mix is curated from current 2026 airport destination and traffic patterns, then operated as an in-house BAV schedule.</p>
    </section>
  );
}
