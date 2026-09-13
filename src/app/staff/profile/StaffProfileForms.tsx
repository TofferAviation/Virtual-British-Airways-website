"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileImagePicker } from "@/components/ProfileImagePicker";

async function updateProfile(body: Record<string, string | null>) {
  const response = await fetch("/api/staff/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string; name?: string };
  if (!response.ok) throw new Error(payload.error || "Unable to update your profile.");
  return payload;
}

export function StaffProfileForms({ initialName, email, role, initialProfileImage }: { initialName: string; email: string; role: string; initialProfileImage: string | null }) {
  const [name, setName] = useState(initialName);
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(initialProfileImage);
  const router = useRouter();

  async function saveProfileImage(nextImage: string | null) {
    const previousImage = profileImage;
    setProfileImage(nextImage);
    setSavingProfile(true);
    setProfileMessage("");
    try {
      await updateProfile({ profileImage: nextImage });
      setProfileMessage("Profile photo updated.");
      router.refresh();
    } catch (error) {
      setProfileImage(previousImage);
      setProfileMessage(error instanceof Error ? error.message : "Unable to update your profile photo.");
      throw error;
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingProfile(true);
    setProfileMessage("");
    try {
      const result = await updateProfile({ name, profileImage });
      setName(result.name ?? name);
      setProfileMessage("Profile updated.");
      router.refresh();
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Unable to update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const currentPassword = String(new FormData(form).get("currentPassword") ?? "");
    const newPassword = String(new FormData(form).get("newPassword") ?? "");
    const confirmation = String(new FormData(form).get("confirmation") ?? "");
    if (newPassword.length < 10) {
      setPasswordMessage("Use a Staff Centre password with at least 10 characters.");
      return;
    }
    if (newPassword !== confirmation) {
      setPasswordMessage("The password confirmation does not match.");
      return;
    }
    setSavingPassword(true);
    setPasswordMessage("");
    try {
      await updateProfile({ currentPassword, newPassword });
      form.reset();
      setPasswordMessage("Staff Centre password updated.");
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "Unable to update password.");
    } finally {
      setSavingPassword(false);
    }
  }

  return <div className="staff-profile-grid">
    <form onSubmit={saveProfile} className="staff-profile-card">
      <div><span>Profile</span><h2>Personal details</h2><p>Your name appears in the Staff Centre and audit history.</p></div>
      <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required autoComplete="name" /></label>
      <label>Email address<input value={email} readOnly aria-readonly="true" /></label>
      <label>Staff role<input value={role} readOnly aria-readonly="true" /></label>
      <ProfileImagePicker value={profileImage} name={name} onChange={saveProfileImage} />
      <button type="submit" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save profile"}</button>
      {profileMessage ? <p className="staff-profile-message">{profileMessage}</p> : null}
    </form>
    <form className="staff-profile-card" onSubmit={savePassword}>
      <div><span>Security</span><h2>Staff password</h2><p>This password signs in only to Staff Centre. It is separate from your BAV pilot password.</p></div>
      <label>Current Staff password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
      <label>New Staff password<input name="newPassword" type="password" autoComplete="new-password" minLength={10} required /></label>
      <label>Confirm new password<input name="confirmation" type="password" autoComplete="new-password" minLength={10} required /></label>
      <button type="submit" disabled={savingPassword}>{savingPassword ? "Updating…" : "Change Staff password"}</button>
      {passwordMessage ? <p className="staff-profile-message">{passwordMessage}</p> : null}
    </form>
  </div>;
}
