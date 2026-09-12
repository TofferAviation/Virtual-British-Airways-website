"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CreateFleetAircraftInput, FleetAircraftImageImportInput, FleetAircraftImageImportResult, FleetAircraftSummary, FleetImportAircraftInput, FleetImportResult, PlaneSpottersPhotoSyncResult } from "@/lib/fleet-service";

type Props = { initialAircraft: FleetAircraftSummary[]; canManage: boolean };

function formatHours(minutes: number) {
  const safe = Math.max(0, Math.floor(minutes));
  return `${Math.floor(safe / 60).toLocaleString("en-GB")}:${String(safe % 60).padStart(2, "0")}`;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function tone(value: string) {
  if (["aog", "grounded", "not_dispatchable", "in_maintenance"].includes(value)) return "critical";
  if (["inspection_required", "serviceable_with_deferred_defects", "dispatchable_with_restrictions"].includes(value)) return "warning";
  if (["scheduled", "assigned", "turnaround"].includes(value)) return "info";
  return "normal";
}

const blankAircraft: CreateFleetAircraftInput = {
  registration: "",
  aircraftModel: "",
  manufacturer: "",
  icaoType: "",
  subfleet: "",
  homeBase: "",
  currentStation: "",
};

const BA_IMPORT_SOURCE = "British Airways Current Fleet vAMSYS, snapshot 2026-09-05";

function cellText(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function manufacturerFor(model: string) {
  const [manufacturer] = model.split(" ");
  return ["Airbus", "Boeing", "Embraer"].includes(manufacturer) ? manufacturer : undefined;
}

async function parseBritishAirwaysWorkbook(file: File): Promise<FleetImportAircraftInput[]> {
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file, "vAMSYS Aircraft");
  const headerRow = rows.findIndex((row) => cellText(row[1]).toLowerCase() === "registration");
  if (headerRow < 0) throw new Error('The workbook needs a "vAMSYS Aircraft" sheet with a Registration column.');
  const headings = new Map(rows[headerRow].map((value, index) => [cellText(value).toLowerCase(), index]));
  const column = (name: string) => {
    const value = headings.get(name.toLowerCase());
    if (value === undefined) throw new Error(`The workbook is missing the ${name} column.`);
    return value;
  };
  const registration = column("Registration");
  const aircraftModel = column("Aircraft Type");
  const icaoType = column("ICAO Type");
  const subfleet = column("Subfleet");
  const sourceStatus = column("Status");
  const seen = new Set<string>();
  const aircraft: FleetImportAircraftInput[] = [];

  for (const row of rows.slice(headerRow + 1)) {
    const tail = cellText(row[registration]).toUpperCase();
    if (!tail) continue;
    const model = cellText(row[aircraftModel]);
    const status = cellText(row[sourceStatus]).toLowerCase();
    if (!/^[A-Z0-9-]{2,16}$/.test(tail)) throw new Error(`Invalid registration in workbook: ${tail}.`);
    if (model.length < 2) throw new Error(`${tail} is missing its aircraft type.`);
    if (status !== "active" && status !== "stored") throw new Error(`${tail} has unsupported status "${cellText(row[sourceStatus])}".`);
    if (seen.has(tail)) throw new Error(`Duplicate registration in workbook: ${tail}.`);
    seen.add(tail);
    const normalizedStatus = status as "active" | "stored";
    aircraft.push({
      registration: tail,
      aircraftModel: model,
      manufacturer: manufacturerFor(model),
      aircraftFamily: model.replace(/-\d+.*$/, ""),
      icaoType: cellText(row[icaoType]).toUpperCase() || undefined,
      subfleet: cellText(row[subfleet]) || undefined,
      operatorName: "British Airways",
      ownerName: "British Airways",
      sourceStatus: normalizedStatus,
    });
  }
  if (!aircraft.length) throw new Error("No aircraft rows were found in the workbook.");
  return aircraft;
}

async function parsePhotoCatalogueWorkbook(file: File): Promise<FleetAircraftImageImportInput[]> {
  const { readSheet } = await import("read-excel-file/browser");
  const rows = await readSheet(file, "Fleet Photos");
  const headerRow = rows.findIndex((row) => cellText(row[0]).toLowerCase() === "registration");
  if (headerRow < 0) throw new Error('The workbook needs a "Fleet Photos" sheet with a Registration column.');
  const headings = new Map(rows[headerRow].map((value, index) => [cellText(value).toLowerCase(), index]));
  const column = (name: string, required = true) => {
    const value = headings.get(name.toLowerCase());
    if (value === undefined && required) throw new Error(`The photo workbook is missing the ${name} column.`);
    return value;
  };
  const registration = column("Registration")!;
  const imageUrl = column("Image URL")!;
  const source = column("Source", false);
  const credit = column("Credit", false);
  const sourcePageUrl = column("Source Page URL", false);
  const seen = new Set<string>();
  const images: FleetAircraftImageImportInput[] = [];
  for (const row of rows.slice(headerRow + 1)) {
    const tail = cellText(row[registration]).toUpperCase();
    if (!tail) continue;
    const url = cellText(row[imageUrl]);
    if (!/^[A-Z0-9-]{2,16}$/.test(tail)) throw new Error(`Invalid registration in photo workbook: ${tail}.`);
    if (!/^https:\/\//i.test(url)) throw new Error(`${tail} needs a direct HTTPS image URL.`);
    if (seen.has(tail)) throw new Error(`Duplicate registration in photo workbook: ${tail}.`);
    seen.add(tail);
    images.push({
      registration: tail,
      imageUrl: url,
      sourceName: source === undefined ? "JetPhotos" : cellText(row[source]) || "JetPhotos",
      credit: credit === undefined ? undefined : cellText(row[credit]) || undefined,
      sourcePageUrl: sourcePageUrl === undefined ? undefined : cellText(row[sourcePageUrl]) || undefined,
    });
  }
  if (!images.length) throw new Error("No photo rows were found in the workbook.");
  return images;
}

export function FleetBoard({ initialAircraft, canManage }: Props) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const importDialog = useRef<HTMLDialogElement>(null);
  const photoImportDialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<CreateFleetAircraftInput>(blankAircraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [importRows, setImportRows] = useState<FleetImportAircraftInput[]>([]);
  const [importId, setImportId] = useState("");
  const [importError, setImportError] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [readingWorkbook, setReadingWorkbook] = useState(false);
  const [importing, setImporting] = useState(false);
  const [photoRows, setPhotoRows] = useState<FleetAircraftImageImportInput[]>([]);
  const [photoImportError, setPhotoImportError] = useState("");
  const [photoImportStatus, setPhotoImportStatus] = useState("");
  const [readingPhotoWorkbook, setReadingPhotoWorkbook] = useState(false);
  const [importingPhotos, setImportingPhotos] = useState(false);
  const [syncingPlanespottersPhotos, setSyncingPlanespottersPhotos] = useState(false);
  const [planespottersPhotoStatus, setPlanespottersPhotoStatus] = useState("");
  const [planespottersPhotoError, setPlanespottersPhotoError] = useState("");
  const aircraft = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return initialAircraft;
    return initialAircraft.filter((item) => [item.registration, item.aircraftModel, item.icaoType, item.subfleet].some((value) => value?.toLowerCase().includes(normalized)));
  }, [initialAircraft, query]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/staff/fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aircraft: form }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not create aircraft.");
      dialog.current?.close();
      setForm(blankAircraft);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create aircraft.");
    } finally {
      setSaving(false);
    }
  }

  async function selectWorkbook(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReadingWorkbook(true);
    setImportError("");
    setImportStatus("");
    setImportRows([]);
    try {
      const parsed = await parseBritishAirwaysWorkbook(file);
      if (parsed.length > 500) throw new Error("This import exceeds the 500-aircraft safety limit.");
      setImportRows(parsed);
      setImportId(crypto.randomUUID());
      const stored = parsed.filter((row) => row.sourceStatus === "stored").length;
      setImportStatus(`${parsed.length} aircraft validated: ${parsed.length - stored} active and ${stored} stored.`);
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : "Could not read this workbook.");
    } finally {
      setReadingWorkbook(false);
      event.target.value = "";
    }
  }

  async function importWorkbook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importRows.length || !importId) return;
    setImporting(true);
    setImportError("");
    try {
      const response = await fetch("/api/staff/fleet/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceLabel: BA_IMPORT_SOURCE, importId, aircraft: importRows }),
      });
      const result = await response.json() as { error?: string; result?: FleetImportResult };
      if (!response.ok || !result.result) throw new Error(result.error || "Could not import the aircraft.");
      setImportStatus(`Imported ${result.result.imported} aircraft: ${result.result.active} active and ${result.result.stored} stored.`);
      setImportRows([]);
      router.refresh();
      window.setTimeout(() => importDialog.current?.close(), 900);
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : "Could not import the aircraft.");
    } finally {
      setImporting(false);
    }
  }

  async function selectPhotoWorkbook(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReadingPhotoWorkbook(true); setPhotoImportError(""); setPhotoImportStatus(""); setPhotoRows([]);
    try {
      const parsed = await parsePhotoCatalogueWorkbook(file);
      if (parsed.length > 500) throw new Error("This photo import exceeds the 500-aircraft safety limit.");
      setPhotoRows(parsed);
      setPhotoImportStatus(`${parsed.length} approved aircraft photos validated and ready to import.`);
    } catch (caught) {
      setPhotoImportError(caught instanceof Error ? caught.message : "Could not read this photo workbook.");
    } finally {
      setReadingPhotoWorkbook(false); event.target.value = "";
    }
  }

  async function importPhotoWorkbook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photoRows.length) return;
    setImportingPhotos(true); setPhotoImportError("");
    try {
      const response = await fetch("/api/staff/fleet/images/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ images: photoRows }),
      });
      const result = await response.json() as { error?: string; result?: FleetAircraftImageImportResult };
      if (!response.ok || !result.result) throw new Error(result.error || "Could not import the photo catalogue.");
      setPhotoImportStatus(`Imported ${result.result.imported} approved aircraft photos.`);
      setPhotoRows([]); router.refresh();
      window.setTimeout(() => photoImportDialog.current?.close(), 900);
    } catch (caught) {
      setPhotoImportError(caught instanceof Error ? caught.message : "Could not import the photo catalogue.");
    } finally {
      setImportingPhotos(false);
    }
  }

  async function syncPlanespottersPhotos() {
    setSyncingPlanespottersPhotos(true);
    setPlanespottersPhotoError("");
    setPlanespottersPhotoStatus("Looking up fleet thumbnails from Planespotters. This can take about a minute for the whole fleet.");
    try {
      const response = await fetch("/api/staff/fleet/images/planespotters-sync", { method: "POST" });
      const result = await response.json() as { error?: string; result?: PlaneSpottersPhotoSyncResult };
      if (!response.ok || !result.result) throw new Error(result.error || "Could not synchronize Planespotters photos.");
      const sync = result.result;
      setPlanespottersPhotoStatus(`Planespotters sync complete: ${sync.imported} photos saved, ${sync.notFound} registrations had no available thumbnail${sync.preserved ? `, and ${sync.preserved} existing manual photos were kept` : ""}${sync.failed ? `. ${sync.failed} lookups failed and can be retried` : "."}`);
      router.refresh();
    } catch (caught) {
      setPlanespottersPhotoStatus("");
      setPlanespottersPhotoError(caught instanceof Error ? caught.message : "Could not synchronize Planespotters photos.");
    } finally {
      setSyncingPlanespottersPhotos(false);
    }
  }

  return <>
    <div className="fleet-board-heading">
      <div><span className="staff-kicker">Fleet board</span><h2>Current aircraft</h2></div>
      <div className="fleet-board-actions">
        <label className="fleet-search"><span className="sr-only">Search aircraft</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search registration, type or fleet" /></label>
        {canManage && initialAircraft.length === 0 ? <button className="fleet-primary-action" type="button" onClick={() => { setImportError(""); setImportStatus(""); setImportRows([]); importDialog.current?.showModal(); }}>Import fleet workbook</button> : null}
        {canManage ? <button type="button" disabled={syncingPlanespottersPhotos} onClick={syncPlanespottersPhotos}>{syncingPlanespottersPhotos ? "Syncing Planespotters…" : "Sync Planespotters photos"}</button> : null}
        {canManage ? <button type="button" onClick={() => { setPhotoImportError(""); setPhotoImportStatus(""); setPhotoRows([]); photoImportDialog.current?.showModal(); }}>Import photo catalogue</button> : null}
        {canManage ? <button className="fleet-primary-action" type="button" onClick={() => { setError(""); dialog.current?.showModal(); }}>Add aircraft</button> : null}
        <span>{aircraft.length} aircraft</span>
      </div>
    </div>
    {planespottersPhotoStatus ? <p className="fleet-import-status" role="status">{planespottersPhotoStatus}</p> : null}
    {planespottersPhotoError ? <p className="fleet-form-error" role="alert">{planespottersPhotoError}</p> : null}
    {!aircraft.length ? <div className="fleet-empty"><strong>{initialAircraft.length ? "No matching aircraft" : "No aircraft records yet"}</strong><p>{initialAircraft.length ? "Try a different registration, type or fleet search." : "The shared fleet is ready. Add verified aircraft master records through the controlled onboarding workflow."}</p></div> : <div className="fleet-table-wrap"><table className="fleet-table">
      <thead><tr><th>Registration</th><th>Type</th><th>Station</th><th>Operations</th><th>Technical</th><th>Dispatch</th><th>Utilization</th></tr></thead>
      <tbody>{aircraft.map((item) => <tr key={item.id}>
        <td><Link className="fleet-record-link" href={`/staff/fleet/${item.id}`}><strong>{item.registration}</strong><small>{item.subfleet ?? "Unassigned subfleet"}</small></Link></td>
        <td>{item.aircraftModel}{item.variant ? ` · ${item.variant}` : ""}<small>{item.icaoType ?? "Type pending"}</small></td>
        <td>{item.currentStation ?? "Unknown"}</td>
        <td><span className={`fleet-status ${tone(item.operationalStatus)}`}>{label(item.operationalStatus)}</span></td>
        <td><span className={`fleet-status ${tone(item.technicalStatus)}`}>{label(item.technicalStatus)}</span></td>
        <td><span className={`fleet-status ${tone(item.dispatchStatus)}`}>{label(item.dispatchStatus)}</span></td>
        <td><strong>FH {formatHours(item.airframeHoursMinutes)}</strong><small>FC {item.airframeCycles.toLocaleString("en-GB")}</small></td>
      </tr>)}</tbody>
    </table></div>}

    <dialog ref={dialog} className="fleet-dialog" onClose={() => setError("")}>
      <form method="dialog" className="fleet-dialog-head"><div><span className="staff-kicker">Controlled onboarding</span><h2>Add aircraft master record</h2><p>Enter verified data only. Unknown technical details can be added later through the aircraft record.</p></div><button className="fleet-icon-button" aria-label="Close" type="submit">×</button></form>
      <form className="fleet-form" onSubmit={submit}>
        <label>Registration<input required value={form.registration} onChange={(event) => setForm({ ...form, registration: event.target.value.toUpperCase() })} placeholder="G-XXXX" maxLength={16} /></label>
        <label>Aircraft model<input required value={form.aircraftModel} onChange={(event) => setForm({ ...form, aircraftModel: event.target.value })} placeholder="Boeing 777-200ER" /></label>
        <label>Manufacturer<input value={form.manufacturer ?? ""} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} placeholder="Boeing" /></label>
        <label>ICAO type<input value={form.icaoType ?? ""} onChange={(event) => setForm({ ...form, icaoType: event.target.value.toUpperCase() })} placeholder="B772" maxLength={8} /></label>
        <label>Fleet / subfleet<input value={form.subfleet ?? ""} onChange={(event) => setForm({ ...form, subfleet: event.target.value })} placeholder="Long haul" /></label>
        <label>Current station<input value={form.currentStation ?? ""} onChange={(event) => setForm({ ...form, currentStation: event.target.value.toUpperCase() })} placeholder="EGLL" maxLength={8} /></label>
        <label>Fleet number<input value={form.fleetNumber ?? ""} onChange={(event) => setForm({ ...form, fleetNumber: event.target.value })} placeholder="77201" /></label>
        <label>MSN<input value={form.msn ?? ""} onChange={(event) => setForm({ ...form, msn: event.target.value })} placeholder="Unknown if not verified" /></label>
        <label>Airframe hours (minutes)<input min="0" type="number" value={form.airframeHoursMinutes ?? ""} onChange={(event) => setForm({ ...form, airframeHoursMinutes: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
        <label>Airframe cycles<input min="0" type="number" value={form.airframeCycles ?? ""} onChange={(event) => setForm({ ...form, airframeCycles: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
        {error ? <p className="fleet-form-error" role="alert">{error}</p> : null}
        <div className="fleet-dialog-actions"><button type="button" onClick={() => dialog.current?.close()}>Cancel</button><button className="fleet-primary-action" disabled={saving} type="submit">{saving ? "Saving…" : "Create aircraft record"}</button></div>
      </form>
    </dialog>

    <dialog ref={importDialog} className="fleet-dialog" onClose={() => { setImportError(""); setImportStatus(""); }}>
      <form method="dialog" className="fleet-dialog-head"><div><span className="staff-kicker">Controlled fleet onboarding</span><h2>Import fleet workbook</h2><p>Read the supplied workbook locally, validate every tail, then create the whole fleet in one audited database transaction.</p></div><button className="fleet-icon-button" aria-label="Close" type="submit">×</button></form>
      <form className="fleet-form fleet-form-single" onSubmit={importWorkbook}>
        <label>British Airways fleet workbook<input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={readingWorkbook || importing} onChange={selectWorkbook} type="file" /></label>
        <p className="fleet-import-note">Use the supplied <strong>British_Airways_Current_Fleet_vAMSYS_2026-09-05</strong> workbook. The importer reads only registration, aircraft type, ICAO type, subfleet, and Active/Stored status. It leaves unverified technical data blank.</p>
        {importStatus ? <p className="fleet-import-status" role="status">{importStatus}</p> : null}
        {importError ? <p className="fleet-form-error" role="alert">{importError}</p> : null}
        <div className="fleet-dialog-actions"><button type="button" onClick={() => importDialog.current?.close()}>Cancel</button><button className="fleet-primary-action" disabled={!importRows.length || importing || readingWorkbook} type="submit">{readingWorkbook ? "Reading workbook…" : importing ? "Importing fleet…" : `Import ${importRows.length || ""} aircraft`}</button></div>
      </form>
    </dialog>

    <dialog ref={photoImportDialog} className="fleet-dialog" onClose={() => { setPhotoImportError(""); setPhotoImportStatus(""); }}>
      <form method="dialog" className="fleet-dialog-head"><div><span className="staff-kicker">Fleet image catalogue</span><h2>Import approved aircraft photos</h2><p>Update every available aircraft image in one validated upload. Existing catalogue entries for matching registrations are replaced.</p></div><button className="fleet-icon-button" aria-label="Close" type="submit">×</button></form>
      <form className="fleet-form fleet-form-single" onSubmit={importPhotoWorkbook}>
        <label>Photo catalogue workbook<input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={readingPhotoWorkbook || importingPhotos} onChange={selectPhotoWorkbook} type="file" /></label>
        <p className="fleet-import-note">Use a workbook with a <strong>Fleet Photos</strong> sheet and these columns: <strong>Registration, Image URL, Source, Credit, Source Page URL</strong>. Only Registration and Image URL are required; Source defaults to Approved source.</p>
        {photoImportStatus ? <p className="fleet-import-status" role="status">{photoImportStatus}</p> : null}
        {photoImportError ? <p className="fleet-form-error" role="alert">{photoImportError}</p> : null}
        <div className="fleet-dialog-actions"><button type="button" onClick={() => photoImportDialog.current?.close()}>Cancel</button><button className="fleet-primary-action" disabled={!photoRows.length || importingPhotos || readingPhotoWorkbook} type="submit">{readingPhotoWorkbook ? "Reading workbook…" : importingPhotos ? "Importing photos…" : `Import ${photoRows.length || ""} photos`}</button></div>
      </form>
    </dialog>
  </>;
}
