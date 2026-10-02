"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function PilotLoginForm({ returnTo = "/account", closedBeta = false }: { returnTo?: string; closedBeta?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; mustChangePassword?: boolean };
      if (!response.ok) {
        setError(body.error || "Could not sign in.");
        return;
      }
      window.location.replace(body.mustChangePassword ? "/account/profile?change-password=required" : returnTo);
    } catch {
      setError(closedBeta ? "Could not reach the sign-in service." : "Could not reach the BAV login service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pilot-auth-form" onSubmit={submit}>
      <label><span>Email address</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} /></label>
      <label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} /></label>
      {error ? <p className="pilot-auth-error" role="alert">{error}</p> : null}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      <p className="pilot-auth-switch"><Link href={closedBeta ? "/closed-beta/forgot-password" : "/forgot-password"}>Forgot your password?</Link></p>
      {closedBeta ? <p className="pilot-auth-switch">Invited users only. Please use the email address that received your beta invitation.</p> : <p className="pilot-auth-switch">New to British Airways Virtual? <Link href="/register">Create a pilot account</Link></p>}
    </form>
  );
}
