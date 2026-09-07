"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 10) {
      setError("Use a password with at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/staff/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || "Could not accept this invitation.");
        return;
      }
      router.replace("/staff-login?invited=1");
      router.refresh();
    } catch {
      setError("Could not reach the staff invitation service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="staff-login-form" onSubmit={submit}>
      <label>
        <span>Create staff password</span>
        <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} />
      </label>
      <label>
        <span>Confirm password</span>
        <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required disabled={busy} />
      </label>
      {error ? <p className="staff-login-error" role="alert">{error}</p> : null}
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? "Activating staff access…" : "Accept staff invitation"}
      </button>
    </form>
  );
}
