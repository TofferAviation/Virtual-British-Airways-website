"use client";

import { FormEvent, useState } from "react";

export function InviteAcceptForm({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/staff/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || "Could not activate Staff Centre access.");
        return;
      }
      window.location.replace("/login?returnTo=%2Fstaff");
    } catch {
      setError("Could not reach the staff invitation service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="staff-login-form" onSubmit={submit}>
      <p className="staff-login-config-note">Use the BAV pilot account with this invitation&apos;s email address. Staff Centre does not have a separate password.</p>
      {error ? <p className="staff-login-error" role="alert">{error}</p> : null}
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? "Activating access…" : "Activate Staff Centre access"}
      </button>
    </form>
  );
}
