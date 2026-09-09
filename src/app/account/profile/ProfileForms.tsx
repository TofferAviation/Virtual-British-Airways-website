"use client";

import { FormEvent, useState } from "react";

async function patchProfile(payload: Record<string, string>) {
  const response = await fetch("/api/pilot/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(body.error || "Unable to update account.");
  return body;
}

export function ProfileForms({ name, email }: { name: string; email: string }) {
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavingProfile(true);
    setProfileMessage("");
    try {
      await patchProfile({ name: String(form.get("name") || ""), email: String(form.get("email") || "") });
      setProfileMessage("Profile updated successfully.");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Unable to update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const newPassword = String(form.get("newPassword") || "");
    const confirmPassword = String(form.get("confirmPassword") || "");
    if (newPassword !== confirmPassword) {
      setPasswordMessage("New passwords do not match.");
      return;
    }
    setSavingPassword(true);
    setPasswordMessage("");
    try {
      await patchProfile({ currentPassword: String(form.get("currentPassword") || ""), newPassword });
      formEl.reset();
      setPasswordMessage("Password changed successfully.");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "Unable to change password.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="pilot-profile-grid">
      <form className="pilot-profile-card" onSubmit={saveProfile}>
        <div><span className="pilot-profile-kicker">PERSONAL DETAILS</span><h2>Your profile</h2><p>Keep the details used by British Airways Virtual up to date.</p></div>
        <label>Full name<input name="name" defaultValue={name} autoComplete="name" required /></label>
        <label>Email address<input name="email" type="email" defaultValue={email} autoComplete="email" required /></label>
        <button type="submit" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save profile"}</button>
        {profileMessage ? <p className="pilot-profile-message">{profileMessage}</p> : null}
      </form>

      <form className="pilot-profile-card" onSubmit={savePassword}>
        <div><span className="pilot-profile-kicker">SECURITY</span><h2>Change password</h2><p>Your password is stored as a one-way salted hash and is never shown to staff.</p></div>
        <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
        <label>New password<input name="newPassword" type="password" minLength={8} autoComplete="new-password" required /></label>
        <label>Confirm new password<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></label>
        <button type="submit" disabled={savingPassword}>{savingPassword ? "Updating…" : "Change password"}</button>
        {passwordMessage ? <p className="pilot-profile-message">{passwordMessage}</p> : null}
      </form>
    </div>
  );
}
