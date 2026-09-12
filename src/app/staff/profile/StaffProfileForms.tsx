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
  const [passwordMessage, setPasswordMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSavingProfile(true); setProfileMessage("");
    try { const result = await updateProfile({ name }); setName(result.name ?? name); setProfileMessage("Profile updated."); }
    catch (error) { setProfileMessage(error instanceof Error ? error.message : "Unable to update profile."); }
    finally { setSavingProfile(false); }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const currentPassword = String(form.get("currentPassword") ?? ""); const newPassword = String(form.get("newPassword") ?? ""); const confirmation = String(form.get("confirmation") ?? "");
    if (newPassword !== confirmation) { setPasswordMessage("New passwords do not match."); return; }
    setSavingPassword(true); setPasswordMessage("");
    try { await updateProfile({ currentPassword, newPassword }); event.currentTarget.reset(); setPasswordMessage("Password updated successfully."); }
    catch (error) { setPasswordMessage(error instanceof Error ? error.message : "Unable to update password."); }
    finally { setSavingPassword(false); }
  }

  return <div className="staff-profile-grid">
    <form onSubmit={saveProfile} className="staff-profile-card"><div><span>Profile</span><h2>Personal details</h2><p>Your name appears in the Staff Centre and audit history.</p></div><label>Display name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required autoComplete="name" /></label><label>Email address<input value={email} readOnly aria-readonly="true" /></label><label>Staff role<input value={role} readOnly aria-readonly="true" /></label><button type="submit" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save profile"}</button>{profileMessage ? <p className="staff-profile-message">{profileMessage}</p> : null}</form>
    <form onSubmit={savePassword} className="staff-profile-card"><div><span>Security</span><h2>Change password</h2><p>Passwords are stored as a one-way salted hash and are never visible to staff.</p></div><label>Current password<input name="currentPassword" type="password" required autoComplete="current-password" /></label><label>New password<input name="newPassword" type="password" minLength={10} required autoComplete="new-password" /></label><label>Confirm new password<input name="confirmation" type="password" minLength={10} required autoComplete="new-password" /></label><button type="submit" disabled={savingPassword}>{savingPassword ? "Updating…" : "Update password"}</button>{passwordMessage ? <p className="staff-profile-message">{passwordMessage}</p> : null}</form>
  </div>;
}
