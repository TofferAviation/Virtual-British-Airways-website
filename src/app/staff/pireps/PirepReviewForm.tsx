"use client";

import { useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import styles from "./PirepReview.module.css";

type Decision = "accepted" | "rejected" | "changes_requested";

type Props = {
  pirepId: string;
  action: (formData: FormData) => void | Promise<void>;
};

const pendingCopy: Record<Decision, string> = {
  accepted: "Accepting PIREP…",
  rejected: "Rejecting PIREP…",
  changes_requested: "Sending change request…",
};

function ReviewFields({ pirepId, submittedDecision }: { pirepId: string; submittedDecision: Decision | null }) {
  const { pending } = useFormStatus();
  const decision = pending ? submittedDecision : null;

  return <>
    <input type="hidden" name="id" value={pirepId} />
    <label><span>Review comments</span><textarea name="comments" rows={3} maxLength={2000} disabled={pending} placeholder="Optional for approval; recommended for rejection or changes." /></label>
    <div className="ops-actions">
      <button className={`ops-secondary${decision === "changes_requested" ? ` ${styles.pending}` : ""}`} name="decision" value="changes_requested" type="submit" disabled={pending} aria-busy={decision === "changes_requested"}>{decision === "changes_requested" ? "Sending…" : "Request changes"}</button>
      <button className={`ops-danger${decision === "rejected" ? ` ${styles.pending}` : ""}`} name="decision" value="rejected" type="submit" disabled={pending} aria-busy={decision === "rejected"}>{decision === "rejected" ? "Rejecting…" : "Reject"}</button>
      <button className={`ops-primary${decision === "accepted" ? ` ${styles.pending}` : ""}`} name="decision" value="accepted" type="submit" disabled={pending} aria-busy={decision === "accepted"}>{decision === "accepted" ? "Accepting…" : "Accept PIREP"}</button>
    </div>
    <p className={`${styles.submission}${decision ? ` ${styles.submitting}` : ""}`} role="status" aria-live="polite">{decision ? pendingCopy[decision] : ""}</p>
  </>;
}

/** Gives staff immediate, accessible feedback while the review action persists. */
export function PirepReviewForm({ pirepId, action }: Props) {
  const [submittedDecision, setSubmittedDecision] = useState<Decision | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!(submitter instanceof HTMLButtonElement)) return;
    const decision = submitter.value;
    if (decision === "accepted" || decision === "rejected" || decision === "changes_requested") setSubmittedDecision(decision);
  }

  return <form action={action} className={`ops-review-form ${styles.form}`} onSubmit={onSubmit} aria-busy={submittedDecision ? "true" : undefined}>
    <ReviewFields pirepId={pirepId} submittedDecision={submittedDecision} />
  </form>;
}
