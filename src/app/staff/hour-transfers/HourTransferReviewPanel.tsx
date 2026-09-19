"use client";

import { useState } from "react";
import type { PilotHourTransferRequest, PublicPilotAccount } from "@/lib/pilot-store";

type ReviewItem = PilotHourTransferRequest & {
  pilot: Pick<PublicPilotAccount, "id" | "name" | "email" | "pilotNumber" | "hours" | "rank"> | null;
};

export function HourTransferReviewPanel({ requests }: { requests: ReviewItem[] }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [hours, setHours] = useState<Record<string, string>>(() => Object.fromEntries(requests.map((request) => [request.id, String(request.requestedHours)])));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function review(request: ReviewItem, decision: "approved" | "declined") {
    setBusyId(request.id);
    setMessage("");
    try {
      const response = await fetch("/api/staff/hour-transfers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          decision,
          creditedHours: decision === "approved" ? Number(hours[request.id]) : undefined,
          reviewNote: notes[request.id] ?? "",
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "Unable to review transfer-credit request.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to review transfer-credit request.");
      setBusyId(null);
    }
  }

  return (
    <section className="hour-transfer-list" aria-label="Transfer-credit requests">
      {message ? <p className="hour-transfer-message">{message}</p> : null}
      {requests.length ? requests.map((request) => {
        const evidenceIsLink = /^https?:\/\/\S+$/i.test(request.evidenceReference);
        const busy = busyId === request.id;
        return <article className="hour-transfer-record" key={request.id}>
          <header>
            <div className="hour-transfer-pilot"><span>{request.pilot?.pilotNumber ?? "BAV"}</span><div><h2>{request.pilot?.name ?? "Former pilot account"}</h2><small>{request.pilot ? `${request.pilot.email} · ${request.pilot.rank} · ${request.pilot.hours.toFixed(1)} current career h` : "The associated pilot account is no longer available."}</small></div></div>
            <span className={`hour-transfer-status hour-transfer-${request.status}`}>{request.status}</span>
          </header>
          <div className="hour-transfer-details">
            <dl><div><dt>Former VA</dt><dd>{request.formerVaName}</dd></div><div><dt>Requested</dt><dd>{request.requestedHours.toFixed(1)} h</dd></div><div><dt>Submitted</dt><dd>{new Date(request.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</dd></div><div><dt>Evidence</dt><dd>{evidenceIsLink ? <a href={request.evidenceReference} target="_blank" rel="noreferrer">Open evidence ↗</a> : request.evidenceReference}</dd></div></dl>
            {request.pilotNote ? <blockquote><b>Pilot note</b>{request.pilotNote}</blockquote> : null}
          </div>
          {request.status === "pending" && request.pilot ? <div className="hour-transfer-review">
            <label>Approved career hours<input type="number" min="0.1" max={request.requestedHours} step="0.1" value={hours[request.id] ?? ""} onChange={(event) => setHours((current) => ({ ...current, [request.id]: event.target.value }))} disabled={busy} /></label>
            <label>Staff review note <small>(required when declining)</small><textarea rows={3} value={notes[request.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Record the evidence reviewed, partial-credit rationale or decline reason." disabled={busy} maxLength={1500} /></label>
            <p>Approval adds only career time and recalculates an automatic rank. It does not generate flights, PIREPs, VA Points, Tier Points or awards.</p>
            <div><button className="hour-transfer-decline" disabled={busy} onClick={() => review(request, "declined")}>{busy ? "Saving…" : "Decline request"}</button><button className="hour-transfer-approve" disabled={busy} onClick={() => review(request, "approved")}>{busy ? "Saving…" : "Approve & credit hours"}</button></div>
          </div> : <footer className="hour-transfer-history"><span>{request.status === "approved" ? `${request.creditedHours?.toFixed(1) ?? "0.0"} h credited` : "No hours credited"}</span><small>{request.reviewedBy ? `Reviewed by ${request.reviewedBy}${request.reviewedAt ? ` · ${new Date(request.reviewedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}` : "Awaiting staff review"}</small>{request.reviewNote ? <p>{request.reviewNote}</p> : null}{request.pilot ? <a className="hour-transfer-manual-link" href={`/staff/pilots?q=${encodeURIComponent(request.pilot.pilotNumber)}`}>Open pilot for manual credit →</a> : null}</footer>}
        </article>;
      }) : <div className="hour-transfer-empty"><b>No transfer-credit requests yet</b><p>New pilot submissions will appear here for a manual decision.</p></div>}
    </section>
  );
}
