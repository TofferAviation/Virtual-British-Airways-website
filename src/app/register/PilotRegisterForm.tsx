"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function PilotRegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ name, email, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || "Could not create your account.");
        return;
      }
      window.location.replace("/account");
    } catch {
      setError("Could not reach the BAV registration service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pilot-auth-form register-form" onSubmit={submit}>
      <label><span>Full name</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required disabled={busy} /></label>
      <label><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} /></label>
      <label><span>Password</span><input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} /></label>
      <label><span>Confirm password</span><input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} required disabled={busy} /></label>
      {error ? <p className="pilot-auth-error" role="alert">{error}</p> : null}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create pilot account"}</button>
      <p className="pilot-auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
    </form>
  );
}
