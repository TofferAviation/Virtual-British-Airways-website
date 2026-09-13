"use client";

import { FormEvent, useState } from "react";

export function InviteAcceptForm({ token }: { token: string }) {
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
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/staff/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || "Could not activate Staff Centre access.");
        return;
      }
      window.location.replace("/staff-login");
    } catch {
      setError("Could not reach the staff invitation service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="staff-login-form" onSubmit={submit}>
      <p className="staff-login-config-note">Choose a separate Staff Centre password. It will not change your BAV pilot password.</p>
      <label><span>Staff Centre password</span><input name="password" type="password" autoComplete="new-password" minLength={10} disabled={busy} required /></label>
      <label><span>Confirm Staff Centre password</span><input name="confirmation" type="password" autoComplete="new-password" minLength={10} disabled={busy} required /></label>
      {error ? <p className="staff-login-error" role="alert">{error}</p> : null}
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? "Activating access…" : "Activate Staff Centre access"}
      </button>
    </form>
  );
}
