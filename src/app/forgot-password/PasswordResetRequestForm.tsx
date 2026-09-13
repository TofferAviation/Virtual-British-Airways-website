"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export function PasswordResetRequestForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      setMessage(body.message || "If an active BAV account uses that email address, a reset link has been sent.");
      if (!response.ok) setError("Could not request a password reset. Please try again.");
    } catch {
      setError("Could not reach the BAV password-reset service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pilot-auth-form" onSubmit={submit}>
      <label><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} /></label>
      {error ? <p className="pilot-auth-error" role="alert">{error}</p> : null}
      {message ? <p className="pilot-auth-success" role="status">{message}</p> : null}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
      <p className="pilot-auth-switch">Remembered it? <Link href="/login">Back to sign in</Link></p>
    </form>
  );
}
