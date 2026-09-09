"use client";

import { useState } from "react";

export function PilotActions({ pilotId, status, canEdit, canSuspend }: { pilotId: string; status: "active" | "suspended"; canEdit: boolean; canSuspend: boolean }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function update(payload: Record<string, string>) {
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

  return (
    <div className="staff-pilot-actions">
      {canSuspend ? <button disabled={busy} className={status === "active" ? "danger" : "success"} onClick={() => update({ status: status === "active" ? "suspended" : "active" })}>{status === "active" ? "Suspend pilot" : "Reactivate pilot"}</button> : null}
      {canEdit ? <button disabled={busy} onClick={() => {
        const rank = window.prompt("Set pilot rank:");
        if (rank) void update({ rank });
      }}>Edit rank</button> : null}
      {message ? <small>{message}</small> : null}
    </div>
  );
}
