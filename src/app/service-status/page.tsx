import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import {
  effectiveComponentStatus,
  getServiceStatusState,
  incidentStageLabel,
  overallServiceStatus,
  serviceStateLabel,
} from "@/lib/service-status-store";
import { StatusSubscriptions } from "./StatusSubscriptions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Service Status",
  description: "Live operational status for British Airways Virtual website and pilot services.",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function formatMaintenanceRange(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return `${startAt} – ${endAt}`;
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(start);
  const startTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(start);
  const endTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(end);
  return `${day}, ${startTime}–${endTime} UTC`;
}

function stateSymbol(state: string) {
  if (state === "operational") return "✓";
  if (state === "degraded") return "!";
  if (state === "maintenance") return "◷";
  return "×";
}

export default async function ServiceStatusPage() {
  const state = await getServiceStatusState();
  const now = new Date();
  const overall = overallServiceStatus(state, now);
  const core = state.components.filter((component) => component.core).slice(0, 4);
  const openIncidents = state.incidents.filter((incident) => incident.stage !== "resolved");
  const resolvedIncidents = state.incidents.filter((incident) => incident.stage === "resolved");
  const incidents = [...openIncidents, ...resolvedIncidents].slice(0, 5);
  const maintenance = [...state.maintenance]
    .filter((item) => item.status === "scheduled")
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 3);
  const averageUptime = state.components.length
    ? state.components.reduce((total, component) => total + component.uptime30d, 0) / state.components.length
    : 100;

  return (
    <>
      <SiteHeader />
      <main className="status-page">
        <section className="status-hero">
          <div className="status-shell status-hero-inner">
            <div className="status-hero-copy">
              <span className="status-kicker">Service status</span>
              <h1>System status</h1>
              <p>Monitor the live status of the British Airways Virtual website, pilot account services, route tools, events and connected systems.</p>
              <i />
            </div>
            <div className="status-hero-message">
              <strong>Live updates across<br />the network</strong>
              <span>People&nbsp;&nbsp; Routes&nbsp;&nbsp; Community&nbsp;&nbsp; Always flying</span>
            </div>
            <div className="status-network-art" aria-hidden="true">
              <span /><span /><span /><span /><span />
            </div>
          </div>
        </section>

        <div className="status-shell status-content">
          <section className={`status-overall status-${overall.state}`}>
            <div className="status-overall-mark">{stateSymbol(overall.state)}</div>
            <div className="status-overall-copy"><h2>{overall.title}</h2><p>{overall.message}</p></div>
            <div className="status-overall-meta"><small>Last updated<br />{formatDateTime(overall.updatedAt)}</small><span>{serviceStateLabel(overall.state)} <i /></span></div>
          </section>

          <section className="status-core-grid">
            {core.map((component) => {
              const status = effectiveComponentStatus(state, component, now);
              return (
                <article className="status-core-card" key={component.id}>
                  <span className="status-core-icon">{component.icon}</span>
                  <div><h3>{component.name}</h3><p>{component.description}</p><span className={`status-label status-label-${status}`}><i />{serviceStateLabel(status)}</span></div>
                </article>
              );
            })}
          </section>

          <div className="status-main-grid">
            <section className="status-panel status-components-panel">
              <div className="status-panel-heading"><h2>System components</h2></div>
              <div className="status-table-wrap">
                <table className="status-table">
                  <thead><tr><th>Component</th><th>Status</th><th>Last updated</th></tr></thead>
                  <tbody>
                    {state.components.map((component) => {
                      const status = effectiveComponentStatus(state, component, now);
                      return <tr key={component.id}><td><strong>{component.name}</strong><small>{component.description}</small></td><td><span className={`status-table-state status-label-${status}`}><i />{serviceStateLabel(status)}</span></td><td>{formatDateTime(component.lastUpdated)}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="status-panel status-incidents-panel" id="incidents">
              <div className="status-panel-heading"><h2>Recent incidents</h2><a href="#incident-history">View incident history →</a></div>
              <div className="status-incident-list">
                {incidents.length ? incidents.map((incident) => {
                  const latest = incident.updates[0];
                  return (
                    <article key={incident.id} className={`status-incident status-incident-${incident.stage}`}>
                      <div className="status-incident-dot" />
                      <div className="status-incident-body">
                        <div className="status-incident-title"><h3>{incident.title}</h3><span>{incidentStageLabel(incident.stage)}</span></div>
                        <time>{formatDateTime(incident.updatedAt)}</time>
                        <p>{latest?.message ?? "Status update published."}</p>
                        <details><summary>View update history</summary><div>{incident.updates.map((update) => <p key={update.id}><strong>{incidentStageLabel(update.stage)} · {formatDateTime(update.createdAt)}</strong><br />{update.message}</p>)}</div></details>
                      </div>
                    </article>
                  );
                }) : <div className="status-empty-state"><strong>No active incidents</strong><span>There are currently no published service incidents.</span></div>}
              </div>
              <span id="incident-history" />
            </section>

            <aside className="status-side-stack">
              <section className="status-side-card status-maintenance-card">
                <div className="status-card-heading"><span className="status-heading-icon">□</span><h2>Scheduled maintenance</h2><a href="#maintenance-list">View all →</a></div>
                <div id="maintenance-list">
                  {maintenance.length ? maintenance.map((item) => <article key={item.id}><strong>{item.title}</strong><span>{formatMaintenanceRange(item.startAt, item.endAt)}</span><p>{item.message}</p><em>Scheduled</em></article>) : <div className="status-side-empty">No scheduled maintenance.</div>}
                </div>
              </section>

              <StatusSubscriptions />

              <section className="status-side-card status-help-card">
                <div className="status-card-heading"><span className="status-heading-icon">?</span><h2>Need help?</h2></div>
                <div className="status-help-actions"><Link className="primary" href="/help">Open help centre ↗</Link><Link href="/help#contact">Report an issue</Link><a href="https://discord.gg/HM76YewaWe" target="_blank" rel="noreferrer">◉ Join our Discord ↗</a></div>
              </section>
            </aside>
          </div>

          <section className="status-uptime-panel">
            <div className="status-uptime-title"><span>▥</span><div><h2>Past 30 days uptime</h2><p>Service availability over the last 30 days</p></div></div>
            {core.map((component) => <div className="status-uptime-item" key={component.id}><span>{component.name}</span><strong>{component.uptime30d.toFixed(2)}%</strong><div>{Array.from({ length: 10 }, (_, index) => <i key={index} className={index < Math.round(component.uptime30d / 10) ? "up" : "down"} />)}</div></div>)}
            <div className="status-uptime-item average"><span>30 day average</span><strong>{averageUptime.toFixed(2)}%</strong><div>{Array.from({ length: 10 }, (_, index) => <i key={index} className={index < Math.round(averageUptime / 10) ? "up" : "down"} />)}</div></div>
          </section>

          <p className="status-public-note">Status information is managed by British Airways Virtual staff. Automated external monitoring can be connected later without changing this public page.</p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
