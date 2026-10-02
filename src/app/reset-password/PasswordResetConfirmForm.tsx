"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type PasswordResetConfirmFormProps = {
  token: string;
  returnHref?: string;
  privatePreview?: boolean;
};

export function PasswordResetConfirmForm({ token, returnHref = "/login", privatePreview = false }: PasswordResetConfirmFormProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) {
        setError(body.error || "Could not reset your password.");
        return;
      }
      setMessage(body.message || "Your password has been reset. You can now sign in.");
    } catch {
      setError(privatePreview ? "Could not reach the password-reset service." : "Could not reach the BAV password-reset service.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <p className="pilot-auth-error">This password-reset link is incomplete. Request a new one from the {privatePreview ? "private sign-in page" : "sign-in page"}.</p>;

  return (
    <form className="pilot-auth-form" onSubmit={submit}>
      <label><span>New password</span><input type="password" autoComplete="new-password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} /></label>
      <label><span>Confirm new password</span><input type="password" autoComplete="new-password" minLength={10} value={confirm} onChange={(event) => setConfirm(event.target.value)} required disabled={busy} /></label>
      {error ? <p className="pilot-auth-error" role="alert">{error}</p> : null}
      {message ? <p className="pilot-auth-success" role="status">{message} <Link href={returnHref}>Sign in</Link></p> : null}
      <button className="button button-primary" type="submit" disabled={busy || Boolean(message)}>{busy ? "Resetting…" : "Reset password"}</button>
    </form>
  );
}
