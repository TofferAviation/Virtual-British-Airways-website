"use client";

import { useState } from "react";
import { PILOT_RANKS, PILOT_TYPE_RATINGS, automaticPilotRank, type PilotRank, type PilotTypeRating } from "@/lib/pilot-ranks";

export function PilotActions({ pilotId, status, canEdit, canSuspend, rankOverride, typeRatings, hours }: {
  pilotId: string;
  status: "active" | "suspended";
  canEdit: boolean;
  canSuspend: boolean;
  rankOverride: PilotRank | null;
  typeRatings: PilotTypeRating[];
  hours: number;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedRank, setSelectedRank] = useState(rankOverride ?? "automatic");
  const [selectedRatings, setSelectedRatings] = useState<PilotTypeRating[]>(typeRatings);
  const [manualHours, setManualHours] = useState("");
  const [manualReason, setManualReason] = useState("");

  async function update(payload: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/staff/pilots/${pilotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "Unable to update pilot.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update pilot.");
      setBusy(false);
    }
  }

  const automatic = automaticPilotRank(hours);

  return (
    <div className="staff-pilot-actions">
      {canSuspend ? <button disabled={busy} className={status === "active" ? "danger" : "success"} onClick={() => update({ status: status === "active" ? "suspended" : "active" })}>{status === "active" ? "Suspend pilot" : "Reactivate pilot"}</button> : null}
      {canEdit ? <details className="staff-pilot-action-panel">
        <summary><span>Manage pilot</span><small>Rank, ratings and career credit</small><b aria-hidden="true">⌄</b></summary>
        <div className="staff-pilot-action-settings">
          <label className="staff-pilot-rank-control">
            <span>Pilot rank</span>
            <select disabled={busy} value={selectedRank} onChange={(event) => setSelectedRank(event.target.value)}>
              <option value="automatic">Automatic · {automatic}</option>
              {PILOT_RANKS.map((rank) => <option key={rank} value={rank}>{rank}</option>)}
            </select>
            <button type="button" disabled={busy || selectedRank === (rankOverride ?? "automatic")} onClick={() => update({ rankOverride: selectedRank === "automatic" ? null : selectedRank })}>Save rank</button>
          </label>
          <fieldset className="staff-pilot-ratings">
            <legend>Long-haul type ratings</legend>
            {PILOT_TYPE_RATINGS.map((rating) => <label key={rating.id}><input type="checkbox" disabled={busy} checked={selectedRatings.includes(rating.id)} onChange={(event) => setSelectedRatings((current) => event.target.checked ? [...current, rating.id] : current.filter((item) => item !== rating.id))} />{rating.aircraftLabel}</label>)}
            <button type="button" disabled={busy || selectedRatings.join(",") === typeRatings.join(",")} onClick={() => update({ typeRatings: selectedRatings })}>Save type ratings</button>
          </fieldset>
          <fieldset className="staff-pilot-hours">
            <legend>Manual career credit</legend>
            <p>Add exceptional verified time without creating a flight, PIREP, VA Points, Tier Points or awards. A reason is saved in the pilot audit record.</p>
            <label>Hours to add<input type="number" min="0.1" max="50000" step="0.1" disabled={busy} value={manualHours} onChange={(event) => setManualHours(event.target.value)} placeholder="e.g. 12.5" /></label>
            <label>Reason<textarea rows={2} disabled={busy} value={manualReason} onChange={(event) => setManualReason(event.target.value)} placeholder="Approved correction, former VA review, or another operational reason" maxLength={1500} /></label>
            <button type="button" disabled={busy || !manualHours || manualReason.trim().length < 3} onClick={() => update({ hoursToAdd: Number(manualHours), adjustmentReason: manualReason })}>Add career hours</button>
          </fieldset>
        </div>
      </details> : null}
      {message ? <small>{message}</small> : null}
    </div>
  );
}
