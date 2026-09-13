"use client";

import { FormEvent, useState } from "react";

export function StaffLoginForm({ returnTo = "/staff" }: { returnTo?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || "Could not sign in to Staff Centre.");
        return;
      }
      window.location.replace(returnTo);
    } catch {
      setError("Could not reach the Staff Centre sign-in service.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="staff-login-form" onSubmit={submit}>
    <label><span>Staff email</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} required /></label>
    <label><span>Staff password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} required /></label>
    {error ? <p className="staff-login-error" role="alert">{error}</p> : null}
    <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in to Staff Centre"}</button>
  </form>;
}
