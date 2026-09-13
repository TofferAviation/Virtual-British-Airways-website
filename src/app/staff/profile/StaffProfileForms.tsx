"use client";

import { FormEvent, useState } from "react";

async function updateProfile(body: Record<string, string>) {
  const response = await fetch("/api/staff/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string; name?: string };
  if (!response.ok) throw new Error(payload.error || "Unable to update your profile.");
  return payload;
}

export function StaffProfileForms({ initialName, email, role }: { initialName: string; email: string; role: string }) {
  const [name, setName] = useState(initialName);
  const [profileMessage, setProfileMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSavingProfile(true); setProfileMessage("");
    try { const result = await updateProfile({ name }); setName(result.name ?? name); setProfileMessage("Profile updated."); }
    catch (error) { setProfileMessage(error instanceof Error ? error.message : "Unable to update profile."); }
    finally { setSavingProfile(false); }
  }

  return <div className="staff-profile-grid">
    <form onSubmit={saveProfile} className="staff-profile-card"><div><span>Profile</span><h2>Personal details</h2><p>Your name appears in the Staff Centre and audit history.</p></div><label>Display name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required autoComplete="name" /></label><label>Email address<input value={email} readOnly aria-readonly="true" /></label><label>Staff role<input value={role} readOnly aria-readonly="true" /></label><button type="submit" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save profile"}</button>{profileMessage ? <p className="staff-profile-message">{profileMessage}</p> : null}</form>
    <section className="staff-profile-card"><div><span>Security</span><h2>Account password</h2><p>Staff Centre uses your BAV account. Change your password from the central account settings.</p></div><a className="staff-primary-button" href="/account/profile">Open account settings</a></section>
  </div>;
}
