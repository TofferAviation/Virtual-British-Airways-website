"use client";

import { FormEvent, useState } from "react";

export function StaffSetupForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password") ?? "");
    const confirmation = String(new FormData(form).get("confirmation") ?? "");
    if (password.length < 10) {
      setError("Use a Staff Centre password with at least 10 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The password confirmation does not match.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/staff/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || "Could not set the Staff Centre password.");
        return;
      }
      window.location.replace("/staff");
    } catch {
      setError("Could not reach the Staff Centre setup service.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="staff-login-form" onSubmit={submit}>
    <p className="staff-login-config-note">This one-time setup creates a separate Staff Centre password. It does not change your BAV pilot password.</p>
    <label><span>New Staff Centre password</span><input name="password" type="password" autoComplete="new-password" minLength={10} disabled={busy} required /></label>
    <label><span>Confirm Staff Centre password</span><input name="confirmation" type="password" autoComplete="new-password" minLength={10} disabled={busy} required /></label>
    {error ? <p className="staff-login-error" role="alert">{error}</p> : null}
    <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Setting up…" : "Set Staff Centre password"}</button>
  </form>;
}
