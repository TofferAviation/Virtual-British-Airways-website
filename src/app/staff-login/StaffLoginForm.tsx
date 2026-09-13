"use client";

import { FormEvent, useState } from "react";

export function StaffLoginForm({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = formData.get("email")?.toString().trim() ?? "";
    const password = formData.get("password")?.toString() ?? "";

    try {
      // Match the proven native-pilot sign-in flow: persist the HttpOnly
      // cookie from a same-origin request, then perform a full navigation.
      // Reading FormData instead of controlled state also keeps browser and
      // password-manager autofill intact at submit time.
      const response = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || "The staff email or password was not accepted.");
        return;
      }
      window.location.replace("/staff");
    } catch {
      setError("Could not reach the Staff Centre login service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="staff-login-form" action="/api/staff/login" method="post" onSubmit={submit}>
      <label>
        <span>Staff email</span>
        <input name="email" type="email" autoComplete="username" required disabled={!configured} />
      </label>
      <label>
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" required disabled={!configured} />
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
