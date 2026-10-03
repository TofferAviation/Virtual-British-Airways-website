"use client";

import { FormEvent, useState } from "react";

const CATEGORIES = ["Aircraft systems", "Flight deck", "Cabin", "Ground equipment", "Other"] as const;

export function FleetDefectReport({ pirepId, registration }: { pirepId: string; registration: string }) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Aircraft systems");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/pilot/fleet-defects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pirepId, category, description }),
      });
      const result = await response.json() as { ok?: boolean; reference?: string; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Unable to submit the technical report.");
      setDescription("");
      setMessage(`Technical report ${result.reference ?? "submitted"} is now awaiting staff review.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit the technical report.");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="debrief-defect-form" onSubmit={submit}>
    <label><span>Report a virtual technical observation for {registration}</span><select value={category} onChange={(event) => setCategory(event.target.value as (typeof CATEGORIES)[number])} disabled={submitting}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
    <label><span>What did you observe?</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={8} maxLength={1000} required disabled={submitting} placeholder="Describe the observation for the technical team. Staff decide any maintenance or dispatch action." /></label>
    <div><button className="button button-outline" type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit technical report"}</button>{message ? <p role="status">{message}</p> : null}</div>
  </form>;
}
