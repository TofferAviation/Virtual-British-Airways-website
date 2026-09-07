"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function StaffLoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || "Could not sign in.");
        return;
      }
      router.replace("/staff");
      router.refresh();
    } catch {
      setError("Could not reach the staff login service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="staff-login-form" onSubmit={submit}>
      <label>
        <span>Staff email</span>
        <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={!configured || busy} />
      </label>
      <label>
        <span>Password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!configured || busy} />
      </label>
      {error ? <p className="staff-login-error" role="alert">{error}</p> : null}
      {!configured ? (
        <p className="staff-login-config-note">
          Staff authentication is not configured yet. Add the BAV_STAFF_EMAIL, BAV_STAFF_PASSWORD and BAV_STAFF_SESSION_SECRET values to your local environment first.
        </p>
      ) : null}
      <button className="button button-primary" type="submit" disabled={!configured || busy}>
        {busy ? "Signing in…" : "Sign in to Staff Centre"}
      </button>
    </form>
  );
}
