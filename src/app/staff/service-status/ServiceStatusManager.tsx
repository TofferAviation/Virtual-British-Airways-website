"use client";

import { useMemo, useState } from "react";
import type {
  IncidentStage,
  MaintenanceStage,
  ServiceState,
  ServiceStatusState,
} from "@/lib/service-status-store";

const serviceOptions: Array<{ value: ServiceState; label: string }> = [
  { value: "operational", label: "Operational" },
  { value: "degraded", label: "Degraded performance" },
  { value: "partial_outage", label: "Partial outage" },
  { value: "major_outage", label: "Major outage" },
  { value: "maintenance", label: "Maintenance" },
];

const incidentOptions: Array<{ value: IncidentStage; label: string }> = [
  { value: "investigating", label: "Investigating" },
  { value: "identified", label: "Identified" },
  { value: "monitoring", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
];

type Props = {
  initialState: ServiceStatusState;
  canEdit: boolean;
};

function localDateTime(value?: string) {
  const date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(date) + " UTC";
}

export function ServiceStatusManager({ initialState, canEdit }: Props) {
  const [state, setState] = useState(initialState);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [incidentTitle, setIncidentTitle] = useState("");
  const [incidentMessage, setIncidentMessage] = useState("");
  const [incidentComponents, setIncidentComponents] = useState<string[]>([]);
  const [maintenanceTitle, setMaintenanceTitle] = useState("");
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintenanceComponents, setMaintenanceComponents] = useState<string[]>([]);
  const [maintenanceStart, setMaintenanceStart] = useState(localDateTime());
  const [maintenanceEnd, setMaintenanceEnd] = useState(localDateTime(new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()));

  const activeIncidents = useMemo(() => state.incidents.filter((incident) => incident.stage !== "resolved"), [state.incidents]);

  async function action(payload: Record<string, unknown>) {
    if (!canEdit) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/staff/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as { state?: ServiceStatusState; error?: string };
      if (!response.ok || !body.state) throw new Error(body.error || "Could not update Service Status.");
      setState(body.state);
      setMessage("Service Status updated and published to the public page.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update Service Status.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSelection(id: string, current: string[], setCurrent: (value: string[]) => void) {
    setCurrent(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function publishIncident() {
    await action({ action: "incident-create", title: incidentTitle, message: incidentMessage, componentIds: incidentComponents });
    setIncidentTitle("");
    setIncidentMessage("");
    setIncidentComponents([]);
  }

  async function scheduleMaintenance() {
    await action({
      action: "maintenance-create",
      title: maintenanceTitle,
      message: maintenanceMessage,
      componentIds: maintenanceComponents,
      startAt: new Date(maintenanceStart).toISOString(),
      endAt: new Date(maintenanceEnd).toISOString(),
    });
    setMaintenanceTitle("");
    setMaintenanceMessage("");
    setMaintenanceComponents([]);
  }

  return (
    <>
      {message ? <div className="staff-message status-admin-shell" role="status">{message}<button onClick={() => setMessage("")}>×</button></div> : null}

      <div className="status-admin-shell status-admin-grid">
        <section className="status-admin-panel">
          <h2>System components</h2>
          <p>Change the public health state or manually maintain the 30-day uptime figure.</p>
          <div className="status-admin-component-list">
            {state.components.map((component) => (
              <div className="status-admin-component" key={component.id}>
                <span className="status-admin-component-icon">{component.icon}</span>
                <span><b>{component.name}</b><small>{component.description}</small></span>
                <select
                  disabled={!canEdit || busy}
                  value={component.status}
                  onChange={(event) => void action({ action: "component-status", id: component.id, status: event.target.value })}
                >
                  {serviceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <input
                  disabled={!canEdit || busy}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={component.uptime30d}
                  title="30-day uptime percentage"
                  onBlur={(event) => {
                    const value = Number(event.currentTarget.value);
                    if (Number.isFinite(value) && value !== component.uptime30d) void action({ action: "component-uptime", id: component.id, uptime: value });
                  }}
                />
              </div>
            ))}
          </div>
        </section>

        <div className="status-admin-stack">
          <section className="status-admin-panel">
            <h2>Publish an incident</h2>
            <p>Create a pilot-facing incident and begin the Investigating → Resolved update flow.</p>
            <div className="status-admin-form">
              <label>Incident title<input disabled={!canEdit} value={incidentTitle} onChange={(event) => setIncidentTitle(event.target.value)} placeholder="Flight search experiencing slower response times" /></label>
              <label>Pilot message<textarea disabled={!canEdit} value={incidentMessage} onChange={(event) => setIncidentMessage(event.target.value)} placeholder="Some route searches may take longer than usual while we investigate." /></label>
              <div className="status-admin-checkboxes">
                {state.components.map((component) => <label key={component.id}><input disabled={!canEdit} type="checkbox" checked={incidentComponents.includes(component.id)} onChange={() => toggleSelection(component.id, incidentComponents, setIncidentComponents)} /> {component.name}</label>)}
              </div>
              <div className="status-admin-actions"><button disabled={!canEdit || busy} className="status-admin-button" onClick={() => void publishIncident()}>Publish incident</button></div>
            </div>
          </section>

          <section className="status-admin-panel">
            <h2>Schedule maintenance</h2>
            <p>Planned downtime is shown separately from unexpected service incidents.</p>
            <div className="status-admin-form">
              <label>Maintenance title<input disabled={!canEdit} value={maintenanceTitle} onChange={(event) => setMaintenanceTitle(event.target.value)} placeholder="Database maintenance" /></label>
              <label>Start<input disabled={!canEdit} type="datetime-local" value={maintenanceStart} onChange={(event) => setMaintenanceStart(event.target.value)} /></label>
              <label>End<input disabled={!canEdit} type="datetime-local" value={maintenanceEnd} onChange={(event) => setMaintenanceEnd(event.target.value)} /></label>
              <label>Pilot message<textarea disabled={!canEdit} value={maintenanceMessage} onChange={(event) => setMaintenanceMessage(event.target.value)} placeholder="Pilot accounts and flight search may be temporarily unavailable." /></label>
              <div className="status-admin-checkboxes">
                {state.components.map((component) => <label key={component.id}><input disabled={!canEdit} type="checkbox" checked={maintenanceComponents.includes(component.id)} onChange={() => toggleSelection(component.id, maintenanceComponents, setMaintenanceComponents)} /> {component.name}</label>)}
              </div>
              <div className="status-admin-actions"><button disabled={!canEdit || busy} className="status-admin-button" onClick={() => void scheduleMaintenance()}>Schedule maintenance</button></div>
            </div>
          </section>
        </div>
      </div>

      <div className="status-admin-shell status-admin-grid" style={{ marginTop: 12 }}>
        <section className="status-admin-panel">
          <h2>Incident manager</h2>
          <p>{activeIncidents.length} active incident{activeIncidents.length === 1 ? "" : "s"}. Publish updates as the issue moves through each stage.</p>
          <div className="status-admin-list">
            {state.incidents.map((incident) => (
              <article key={incident.id}>
                <header><h3>{incident.title}</h3><span>{incident.stage}</span></header>
                <time>{formatDate(incident.updatedAt)}</time>
                <p>{incident.updates[0]?.message}</p>
                {canEdit ? <div className="status-admin-inline">
                  <select defaultValue={incident.stage} id={`stage-${incident.id}`}>{incidentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  <input id={`message-${incident.id}`} placeholder="Publish a new pilot-facing update…" />
                  <button disabled={busy} onClick={() => {
                    const stage = (document.getElementById(`stage-${incident.id}`) as HTMLSelectElement | null)?.value as IncidentStage;
                    const updateMessage = (document.getElementById(`message-${incident.id}`) as HTMLInputElement | null)?.value ?? "";
                    void action({ action: "incident-update", id: incident.id, stage, message: updateMessage });
                  }}>Publish</button>
                </div> : null}
                {canEdit && incident.stage === "resolved" ? <button className="danger" disabled={busy} onClick={() => void action({ action: "incident-delete", id: incident.id })}>Delete history entry</button> : null}
              </article>
            ))}
            {!state.incidents.length ? <p>No incidents have been published yet.</p> : null}
          </div>
        </section>

        <section className="status-admin-panel">
          <h2>Maintenance manager</h2>
          <p>Upcoming and historical maintenance notices shown on the public status page.</p>
          <div className="status-admin-list">
            {state.maintenance.map((item) => (
              <article key={item.id}>
                <header><h3>{item.title}</h3><span>{item.status}</span></header>
                <time>{formatDate(item.startAt)} → {formatDate(item.endAt)}</time>
                <p>{item.message}</p>
                {canEdit ? <div className="status-admin-inline">
                  <select defaultValue={item.status} id={`maintenance-${item.id}`}><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
                  <span />
                  <button disabled={busy} onClick={() => {
                    const status = (document.getElementById(`maintenance-${item.id}`) as HTMLSelectElement | null)?.value as MaintenanceStage;
                    void action({ action: "maintenance-update", id: item.id, status });
                  }}>Save</button>
                </div> : null}
                {canEdit && item.status !== "scheduled" ? <button className="danger" disabled={busy} onClick={() => void action({ action: "maintenance-delete", id: item.id })}>Delete notice</button> : null}
              </article>
            ))}
            {!state.maintenance.length ? <p>No maintenance has been scheduled yet.</p> : null}
          </div>
        </section>
      </div>
    </>
  );
}
