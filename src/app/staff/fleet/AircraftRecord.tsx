"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { FleetAircraftImageInput, FleetAircraftRecord, FleetDefect, FleetDefectInput, FleetDefectTransitionInput, FleetStatusTransitionInput } from "@/lib/fleet-service";

type Props = { aircraft: FleetAircraftRecord; canManage: boolean; canManageDefects: boolean; canReportDefect: boolean; canRelease: boolean };
type StatusAction = "declare_aog" | "release_to_service" | null;
type DefectAction = FleetDefectTransitionInput["action"];

function label(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function date(value: string | null) { return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC" : "Not available"; }
function hours(minutes: number) { return `${Math.floor(minutes / 60).toLocaleString("en-GB")}:${String(minutes % 60).padStart(2, "0")}`; }

export function AircraftRecord({ aircraft, canManage, canManageDefects, canReportDefect, canRelease }: Props) {
  const router = useRouter();
  const actionDialog = useRef<HTMLDialogElement>(null);
  const defectDialog = useRef<HTMLDialogElement>(null);
  const defectActionDialog = useRef<HTMLDialogElement>(null);
  const [statusAction, setStatusAction] = useState<StatusAction>(null);
  const [reason, setReason] = useState("");
  const [station, setStation] = useState(aircraft.currentStation ?? "");
  const [statusError, setStatusError] = useState("");
  const [defectError, setDefectError] = useState("");
  const [defectActionError, setDefectActionError] = useState("");
  const [imageError, setImageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [defect, setDefect] = useState<FleetDefectInput>({ category: "Passenger seat", description: "", severity: "normal", dispatchImpact: "none", station: aircraft.currentStation ?? "", source: "administrator" });
  const [managedDefect, setManagedDefect] = useState<FleetDefect | null>(null);
  const [defectAction, setDefectAction] = useState<DefectAction>("review");
  const [defectNotes, setDefectNotes] = useState("");
  const [deferral, setDeferral] = useState({ kind: "mel" as "mel" | "cdl" | "airline_rule", reference: "", restriction: "", operationalProcedure: "", maintenanceProcedure: "" });
  const [image, setImage] = useState<FleetAircraftImageInput>({ imageUrl: aircraft.image?.url ?? "", sourceName: aircraft.image?.source ?? "JetPhotos", credit: aircraft.image?.credit ?? "", sourcePageUrl: aircraft.image?.sourcePageUrl ?? "" });

  function openAction(action: Exclude<StatusAction, null>) {
    setStatusAction(action); setReason(""); setStatusError(""); actionDialog.current?.showModal();
  }
  async function submitStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statusAction) return;
    const transition: FleetStatusTransitionInput = statusAction === "declare_aog" ? {
      expectedVersion: aircraft.statusVersion, operationalStatus: aircraft.operationalStatus, technicalStatus: "aog", dispatchStatus: "not_dispatchable", action: "declare_aog", reason, station,
    } : {
      expectedVersion: aircraft.statusVersion, operationalStatus: "available", technicalStatus: "serviceable", dispatchStatus: "dispatchable", action: "release_to_service", reason, station,
    };
    setSaving(true); setStatusError("");
    try {
      const response = await fetch(`/api/staff/fleet/${aircraft.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transition }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update aircraft status.");
      actionDialog.current?.close(); router.refresh();
    } catch (caught) { setStatusError(caught instanceof Error ? caught.message : "Could not update aircraft status."); } finally { setSaving(false); }
  }
  async function submitDefect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setDefectError("");
    try {
      const response = await fetch(`/api/staff/fleet/${aircraft.id}/defects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defect }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not report defect.");
      defectDialog.current?.close(); router.refresh();
    } catch (caught) { setDefectError(caught instanceof Error ? caught.message : "Could not report defect."); } finally { setSaving(false); }
  }
  async function submitImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setImageError("");
    try {
      const response = await fetch(`/api/staff/fleet/${aircraft.id}/image`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save aircraft photo.");
      router.refresh();
    } catch (caught) { setImageError(caught instanceof Error ? caught.message : "Could not save aircraft photo."); } finally { setSaving(false); }
  }
  function manageDefect(item: FleetDefect) {
    setManagedDefect(item); setDefectAction("review"); setDefectNotes(""); setDefectActionError("");
    setDeferral({ kind: item.deferral?.deferral_kind ?? "mel", reference: item.deferral?.reference ?? "", restriction: item.deferral?.restriction ?? "", operationalProcedure: item.deferral?.operational_procedure ?? "", maintenanceProcedure: item.deferral?.maintenance_procedure ?? "" });
    defectActionDialog.current?.showModal();
  }
  async function submitDefectAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!managedDefect) return;
    const transition: FleetDefectTransitionInput = { expectedVersion: managedDefect.version, action: defectAction, notes: defectNotes, ...(defectAction === "defer" ? { deferral } : {}) };
    setSaving(true); setDefectActionError("");
    try {
      const response = await fetch(`/api/staff/fleet/${aircraft.id}/defects/${managedDefect.id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transition }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update defect.");
      defectActionDialog.current?.close(); router.refresh();
    } catch (caught) { setDefectActionError(caught instanceof Error ? caught.message : "Could not update defect."); } finally { setSaving(false); }
  }
  const available = aircraft.availability.available;
  return <>
    <header className="fleet-record-header"><div><span className="staff-kicker">Aircraft technical record</span><h1>{aircraft.registration}</h1><p>{aircraft.manufacturer ? `${aircraft.manufacturer} ` : ""}{aircraft.aircraftModel}{aircraft.variant ? ` · ${aircraft.variant}` : ""} {aircraft.icaoType ? `(${aircraft.icaoType})` : ""}</p></div><div className={`fleet-availability ${available ? "available" : "unavailable"}`}><span>Dispatch availability</span><strong>{available ? "Available" : "Unavailable"}</strong><small>{aircraft.availability.reasons[0] ?? label(aircraft.availability.dispatchStatus)}</small></div></header>
    <nav className="fleet-record-nav" aria-label="Aircraft record sections"><a href="#overview">Overview</a><a href="#defects">Defects</a><a href="#maintenance">Maintenance</a><a href="#logbook">Technical log</a><a href="#history">History</a></nav>
    <div className="fleet-action-bar">
      {canManage && aircraft.technicalStatus !== "aog" ? <button className="fleet-danger-action" type="button" onClick={() => openAction("declare_aog")}>Declare AOG</button> : null}
      {canRelease && aircraft.technicalStatus === "aog" ? <button className="fleet-primary-action" type="button" onClick={() => openAction("release_to_service")}>Release to service</button> : null}
      {canReportDefect ? <button type="button" onClick={() => { setDefectError(""); defectDialog.current?.showModal(); }}>Report defect</button> : null}
    </div>
    {canManage ? <section className="fleet-record-section"><div className="fleet-section-heading"><div><span className="staff-kicker">Fleet image catalogue</span><h2>Approved aircraft photo</h2></div></div><p className="fleet-section-empty">Paste the direct HTTPS image URL that is approved for use, plus its source and credit. This image is shown in the Fleet desktop app; FreeFlight does not scrape or hotlink a search result.</p><form className="fleet-form" onSubmit={submitImage}><label className="fleet-form-wide">Direct image URL<input required type="url" value={image.imageUrl} onChange={(event) => setImage({ ...image, imageUrl: event.target.value })} placeholder="https://…/aircraft-photo.jpg" /></label><label>Source<input required value={image.sourceName} onChange={(event) => setImage({ ...image, sourceName: event.target.value })} placeholder="JetPhotos" /></label><label>Credit<input value={image.credit ?? ""} onChange={(event) => setImage({ ...image, credit: event.target.value })} placeholder="Photographer / rights holder" /></label><label className="fleet-form-wide">Source page URL (optional)<input type="url" value={image.sourcePageUrl ?? ""} onChange={(event) => setImage({ ...image, sourcePageUrl: event.target.value })} placeholder="https://…" /></label>{imageError ? <p className="fleet-form-error" role="alert">{imageError}</p> : null}<div className="fleet-dialog-actions"><button className="fleet-primary-action" disabled={saving} type="submit">{saving ? "Saving…" : "Save approved photo"}</button></div></form></section> : null}
    <section id="overview" className="fleet-record-section"><div className="fleet-section-heading"><div><span className="staff-kicker">Overview</span><h2>Operational condition</h2></div><span className={`fleet-status ${available ? "normal" : "critical"}`}>{available ? "Dispatchable" : "Not dispatchable"}</span></div><div className="fleet-facts">
      <div><span>Operations</span><strong>{label(aircraft.operationalStatus)}</strong></div><div><span>Technical</span><strong>{label(aircraft.technicalStatus)}</strong></div><div><span>Station</span><strong>{aircraft.currentStation ?? "Unknown"}</strong></div><div><span>Configuration</span><strong>{aircraft.configurationId ?? "Not assigned"}</strong></div><div><span>Flight hours</span><strong>{hours(aircraft.airframeHoursMinutes)}</strong></div><div><span>Cycles</span><strong>{aircraft.airframeCycles.toLocaleString("en-GB")}</strong></div>
    </div>{aircraft.availability.reasons.length ? <div className="fleet-alert"><strong>Availability restrictions</strong><ul>{aircraft.availability.reasons.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}</section>
    <section id="defects" className="fleet-record-section"><div className="fleet-section-heading"><div><span className="staff-kicker">Defects &amp; restrictions</span><h2>Live operational condition</h2></div><span>{aircraft.defects.length} records</span></div>{aircraft.defects.length ? <div className="fleet-list">{aircraft.defects.map((item) => <article key={item.id}><div><strong>{item.reference}</strong><span className={`fleet-status ${item.status === "deferred" ? "warning" : item.status === "closed" || item.status === "rectified" ? "normal" : item.severity === "critical" ? "critical" : "warning"}`}>{label(item.status)}</span></div><p>{item.description}</p><small>{item.category}{item.seat_number ? ` · ${item.seat_number}` : ""} · {label(item.severity)} · {label(item.dispatch_impact)} · {date(item.reported_at)}</small>{item.deferral ? <div className="fleet-alert"><strong>{item.deferral.deferral_kind.toUpperCase()} {item.deferral.reference}</strong><p>{item.deferral.restriction}</p></div> : null}{canManageDefects && !["closed", "voided"].includes(item.status) ? <button type="button" onClick={() => manageDefect(item)}>Manage defect</button> : null}</article>)}</div> : <p className="fleet-section-empty">No defect reports have been recorded.</p>}</section>
    <section id="maintenance" className="fleet-record-section"><div className="fleet-section-heading"><div><span className="staff-kicker">Maintenance</span><h2>Due tasks</h2></div></div>{aircraft.maintenanceDue.length ? <div className="fleet-list">{aircraft.maintenanceDue.map((item) => <article key={item.task_id}><div><strong>{item.task_code}</strong><span className={`fleet-status ${item.due_status === "overdue" ? "critical" : item.due_status === "due_soon" ? "warning" : "normal"}`}>{label(item.due_status)}</span></div><p>{item.task_name}</p><small>{item.due_reason}</small></article>)}</div> : <p className="fleet-section-empty">No maintenance tasks apply to this aircraft configuration yet.</p>}</section>
    <section id="logbook" className="fleet-record-section"><div className="fleet-section-heading"><div><span className="staff-kicker">Technical log</span><h2>Chronological operational record</h2></div></div>{aircraft.logbook.length ? <div className="fleet-timeline">{aircraft.logbook.map((item) => <article key={item.id}><time>{date(item.occurred_at)}</time><div><strong>{item.reference} · {label(item.category)}</strong><p>{item.description}</p><small>{item.station ?? "Station not recorded"}</small></div></article>)}</div> : <p className="fleet-section-empty">No technical-log entries have been recorded.</p>}</section>
    <section id="history" className="fleet-record-section"><div className="fleet-section-heading"><div><span className="staff-kicker">Status history</span><h2>Controlled state changes</h2></div></div>{aircraft.statusHistory.length ? <div className="fleet-timeline">{aircraft.statusHistory.map((item) => <article key={item.id}><time>{date(item.effective_at)}</time><div><strong>{label(item.operational_status)} · {label(item.technical_status)}</strong><p>{item.reason}</p><small>{item.station ?? "Station not recorded"} · {item.source}</small></div></article>)}</div> : <p className="fleet-section-empty">No controlled status changes have been recorded.</p>}</section>
    <dialog ref={actionDialog} className="fleet-dialog"><form method="dialog" className="fleet-dialog-head"><div><span className="staff-kicker">Controlled operational action</span><h2>{statusAction === "declare_aog" ? "Declare aircraft AOG" : "Release aircraft to service"}</h2><p>{statusAction === "declare_aog" ? "This makes the aircraft unavailable for dispatch until an authorized AOG or return-to-service action resolves it." : "This action is only accepted when no critical defect, damage or blocking maintenance condition remains."}</p></div><button className="fleet-icon-button" type="submit" aria-label="Close">×</button></form><form className="fleet-form fleet-form-single" onSubmit={submitStatus}><label>Reason<textarea required minLength={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={statusAction === "declare_aog" ? "Describe the AOG condition" : "Record the maintenance sign-off or release reference"} /></label><label>Station<input value={station} onChange={(event) => setStation(event.target.value.toUpperCase())} maxLength={8} placeholder="EGLL" /></label>{statusError ? <p className="fleet-form-error" role="alert">{statusError}</p> : null}<div className="fleet-dialog-actions"><button type="button" onClick={() => actionDialog.current?.close()}>Cancel</button><button className={statusAction === "declare_aog" ? "fleet-danger-action" : "fleet-primary-action"} disabled={saving} type="submit">{saving ? "Saving…" : statusAction === "declare_aog" ? "Confirm AOG" : "Confirm release"}</button></div></form></dialog>
    <dialog ref={defectDialog} className="fleet-dialog"><form method="dialog" className="fleet-dialog-head"><div><span className="staff-kicker">Defect reporting</span><h2>Report aircraft or cabin defect</h2><p>Reports become permanent technical-log records. Critical blocking defects automatically require inspection and stop dispatch.</p></div><button className="fleet-icon-button" type="submit" aria-label="Close">×</button></form><form className="fleet-form" onSubmit={submitDefect}><label>Category<select value={defect.category} onChange={(event) => setDefect({ ...defect, category: event.target.value })}><option>Passenger seat</option><option>IFE</option><option>USB/power</option><option>Galley</option><option>Lavatory</option><option>Cabin door</option><option>PSU / lighting</option><option>Aircraft system</option><option>Other</option></select></label><label>Seat / position<input value={defect.seatNumber ?? ""} onChange={(event) => setDefect({ ...defect, seatNumber: event.target.value.toUpperCase() })} placeholder="12A, L1, G1" /></label><label>Severity<select value={defect.severity} onChange={(event) => setDefect({ ...defect, severity: event.target.value as FleetDefectInput["severity"] })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label><label>Dispatch impact<select value={defect.dispatchImpact} onChange={(event) => setDefect({ ...defect, dispatchImpact: event.target.value as FleetDefectInput["dispatchImpact"] })}><option value="none">None</option><option value="restriction">Restriction</option><option value="blocking">Blocking</option></select></label><label>Station<input value={defect.station ?? ""} onChange={(event) => setDefect({ ...defect, station: event.target.value.toUpperCase() })} maxLength={8} placeholder="EGLL" /></label><label className="fleet-form-wide">Description<textarea required minLength={3} value={defect.description} onChange={(event) => setDefect({ ...defect, description: event.target.value })} placeholder="Describe the observed condition and any operational impact." /></label>{defectError ? <p className="fleet-form-error" role="alert">{defectError}</p> : null}<div className="fleet-dialog-actions"><button type="button" onClick={() => defectDialog.current?.close()}>Cancel</button><button className="fleet-primary-action" disabled={saving} type="submit">{saving ? "Saving…" : "Submit defect report"}</button></div></form></dialog>
    <dialog ref={defectActionDialog} className="fleet-dialog"><form method="dialog" className="fleet-dialog-head"><div><span className="staff-kicker">Controlled defect action</span><h2>{managedDefect?.reference ?? "Defect"}</h2><p>Every action is added to the aircraft technical log and audit history.</p></div><button className="fleet-icon-button" type="submit" aria-label="Close">×</button></form><form className="fleet-form" onSubmit={submitDefectAction}><label>Action<select value={defectAction} onChange={(event) => setDefectAction(event.target.value as DefectAction)}><option value="review">Mark under review</option><option value="defer">Defer under MEL / CDL</option><option value="schedule_maintenance">Schedule maintenance</option><option value="start_work">Start work</option><option value="await_parts">Await parts</option><option value="rectify">Rectify</option><option value="close">Close</option><option value="void">Void invalid report</option></select></label><label className="fleet-form-wide">Action note<textarea required minLength={3} value={defectNotes} onChange={(event) => setDefectNotes(event.target.value)} placeholder="Record the engineering or operational decision." /></label>{defectAction === "defer" ? <><label>Deferral kind<select value={deferral.kind} onChange={(event) => setDeferral({ ...deferral, kind: event.target.value as typeof deferral.kind })}><option value="mel">MEL</option><option value="cdl">CDL</option><option value="airline_rule">Airline rule</option></select></label><label>Reference<input required value={deferral.reference} onChange={(event) => setDeferral({ ...deferral, reference: event.target.value.toUpperCase() })} placeholder="MEL 25-10-01" /></label><label className="fleet-form-wide">Restriction<input required value={deferral.restriction} onChange={(event) => setDeferral({ ...deferral, restriction: event.target.value })} placeholder="State the operational restriction." /></label><label>Operational procedure<input value={deferral.operationalProcedure} onChange={(event) => setDeferral({ ...deferral, operationalProcedure: event.target.value })} /></label><label>Maintenance procedure<input value={deferral.maintenanceProcedure} onChange={(event) => setDeferral({ ...deferral, maintenanceProcedure: event.target.value })} /></label></> : null}{defectActionError ? <p className="fleet-form-error" role="alert">{defectActionError}</p> : null}<div className="fleet-dialog-actions"><button type="button" onClick={() => defectActionDialog.current?.close()}>Cancel</button><button className="fleet-primary-action" disabled={saving} type="submit">{saving ? "Saving…" : "Save controlled action"}</button></div></form></dialog>
  </>;
}
