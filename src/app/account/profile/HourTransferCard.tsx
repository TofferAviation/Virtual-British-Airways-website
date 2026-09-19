"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { PilotHourTransferRequest } from "@/lib/pilot-store";
import styles from "./hour-transfer.module.css";

export function HourTransferCard({ requests }: { requests: PilotHourTransferRequest[] }) {
  const router = useRouter();
  const [formerVaName, setFormerVaName] = useState("");
  const [requestedHours, setRequestedHours] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [pilotNote, setPilotNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = requests.find((request) => request.status === "pending");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/pilot/hour-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formerVaName, requestedHours: Number(requestedHours), evidenceReference, pilotNote }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || "Unable to submit your request.");
      setFormerVaName("");
      setRequestedHours("");
      setEvidenceReference("");
      setPilotNote("");
      setMessage("Your request is with BAV Operations for manual review.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} id="transfer-credit">
      <div className={styles.heading}>
        <div><span>CAREER TRANSFER CREDIT</span><h2>Bring verified former VA hours</h2><p>Submit one request for a manual staff review. Approved credit changes career flight time and can update your automatic rank; it never creates flights, PIREPs, VA Points, Tier Points or awards.</p></div>
        <div className={styles.badge}><b>{pending ? "Under review" : "Manual review"}</b><small>{pending ? "One request is awaiting a decision" : "Evidence is checked by staff"}</small></div>
      </div>

      <div className={styles.grid}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.formHead}><strong>Request transfer credit</strong><small>Use a public profile link, pilot ID, logbook reference or another clear evidence reference.</small></div>
          <label>Former virtual airline<input disabled={busy || Boolean(pending)} value={formerVaName} onChange={(event) => setFormerVaName(event.target.value)} placeholder="Example Virtual Airline" required maxLength={90} /></label>
          <label>Career hours to transfer<input disabled={busy || Boolean(pending)} value={requestedHours} onChange={(event) => setRequestedHours(event.target.value)} placeholder="e.g. 248.5" type="number" min="0.1" max="50000" step="0.1" required /></label>
          <label>Evidence link or reference<input disabled={busy || Boolean(pending)} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} placeholder="Logbook URL, public profile, pilot ID or evidence reference" required maxLength={500} /></label>
          <label>Supporting note <small>(optional)</small><textarea disabled={busy || Boolean(pending)} value={pilotNote} onChange={(event) => setPilotNote(event.target.value)} placeholder="Anything that will help Operations verify this request." maxLength={1500} rows={3} /></label>
          <button disabled={busy || Boolean(pending)} type="submit">{busy ? "Sending request…" : pending ? "Request under review" : "Send for staff review"}</button>
          {message ? <p className={styles.message}>{message}</p> : null}
        </form>

        <aside className={styles.history} aria-label="Transfer-credit request history">
          <div className={styles.formHead}><strong>Your requests</strong><small>Staff decisions remain visible here.</small></div>
          {requests.length ? <div className={styles.requestList}>{requests.slice(0, 5).map((request) => <article key={request.id} className={styles.request}>
            <div><span className={`${styles.status} ${styles[request.status]}`}>{request.status}</span><strong>{request.formerVaName}</strong><small>Requested {request.requestedHours.toFixed(1)} h · {new Date(request.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</small></div>
            {request.status === "approved" ? <b>+{request.creditedHours?.toFixed(1) ?? "0.0"} h credited</b> : null}
            {request.reviewNote ? <p>{request.reviewNote}</p> : null}
          </article>)}</div> : <div className={styles.empty}>No transfer-credit requests yet. Your submitted request and the staff decision will appear here.</div>}
        </aside>
      </div>
    </section>
  );
}
