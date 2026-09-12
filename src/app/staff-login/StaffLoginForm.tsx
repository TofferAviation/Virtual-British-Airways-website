"use client";

import { useState } from "react";

export function StaffLoginForm({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  function submit() {
    setBusy(true);
  }

  return (
    <form className="staff-login-form" action="/api/staff/login" method="post" onSubmit={submit}>
      <label>
        <span>Staff email</span>
        <input name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={!configured || busy} />
      </label>
      <label>
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={!configured || busy} />
      </label>
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
