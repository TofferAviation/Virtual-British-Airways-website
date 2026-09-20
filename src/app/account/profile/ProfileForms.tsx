"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ProfileImagePicker } from "@/components/ProfileImagePicker";
import { BAV_HUBS } from "@/lib/hubs";
import styles from "./ember-download.module.css";
import hubStyles from "./hub-picker.module.css";
import rulesStyles from "./pilot-rules.module.css";

const EMBER_INSTALLER_URL = "https://github.com/TofferAviation/FreeFlight-Cabin-Controls/releases/download/v0.5.22/Ember_Systems.exe";

async function patchProfile(payload: Record<string, string | null>) {
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

export function ProfileForms({ name, email, hub, simbriefPilotId, profileImage: initialProfileImage, pilotRulesAcceptedAt, pilotRulesVersion }: { name: string; email: string; hub: string; simbriefPilotId: string; profileImage: string | null; pilotRulesAcceptedAt: string | null; pilotRulesVersion: string | null }) {
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [simbriefMessage, setSimbriefMessage] = useState("");
  const [savingSimbrief, setSavingSimbrief] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(initialProfileImage);
  const router = useRouter();

  async function saveProfileImage(nextImage: string | null) {
    const previousImage = profileImage;
    setProfileImage(nextImage);
    setSavingProfile(true);
    setProfileMessage("");
    try {
      await patchProfile({ profileImage: nextImage });
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
    const form = new FormData(event.currentTarget);
    setSavingProfile(true);
    setProfileMessage("");
    try {
      await patchProfile({ name: String(form.get("name") || ""), email: String(form.get("email") || ""), hub: String(form.get("hub") || ""), profileImage });
      setProfileMessage("Profile updated successfully.");
      router.refresh();
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "Unable to update profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveSimbrief(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavingSimbrief(true);
    setSimbriefMessage("");
    try {
      await patchProfile({ simbriefPilotId: String(form.get("simbriefPilotId") || "") });
      setSimbriefMessage("SimBrief Pilot ID saved. It will be used when you generate and sync a BAV flight plan.");
    } catch (error) {
      setSimbriefMessage(error instanceof Error ? error.message : "Unable to update SimBrief settings.");
    } finally {
      setSavingSimbrief(false);
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
        <label>Home hub<select className={hubStyles.select} name="hub" defaultValue={hub}>{BAV_HUBS.map((item) => <option key={item.code} value={item.name}>{item.name} ({item.code}) — {item.role}</option>)}</select><small className={hubStyles.hint}>This sets the default departure hub on the BAV flight search. You can change it whenever you like.</small></label>
        <ProfileImagePicker value={profileImage} name={name} onChange={saveProfileImage} />
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

      <form className="pilot-profile-card" onSubmit={saveSimbrief}>
        <div><span className="pilot-profile-kicker">FLIGHT PLANNING</span><h2>SimBrief connection</h2><p>Save your numeric SimBrief Pilot ID so BAV can pre-fill dispatches for your selected flights and save the generated plan to your BAV assignment. Your SimBrief password is never requested or stored.</p></div>
        <label>SimBrief Pilot ID<input name="simbriefPilotId" inputMode="numeric" pattern="[0-9]*" maxLength={12} defaultValue={simbriefPilotId} placeholder="For example: 123456" /></label>
        <button type="submit" disabled={savingSimbrief}>{savingSimbrief ? "Saving…" : "Save SimBrief setting"}</button>
        {simbriefMessage ? <p className="pilot-profile-message">{simbriefMessage}</p> : null}
      </form>

      <article className={`pilot-profile-card ${styles.card}`}>
        <div>
          <span className="pilot-profile-kicker">PILOT SYSTEMS</span>
          <a className={styles.logoLink} href={EMBER_INSTALLER_URL} download aria-label="Download Ember ACARS for Windows">
            <Image className={styles.logo} src="/branding/ember-logo-ba-blue-text.png" alt="Ember" width={560} height={256} priority />
          </a>
          <h2>Ember ACARS</h2>
          <p>Ember connects your selected BAV flight, aircraft reservation and simulator telemetry to BA-Radar.</p>
        </div>
        <div className={styles.access}><strong>Included with your pilot account</strong><span>Your secure Windows installer is ready to download. Open it yourself after the download finishes to begin setup.</span></div>
        <a className={styles.downloadButton} href={EMBER_INSTALLER_URL} download aria-describedby="ember-download-note">Download Ember ACARS for Windows</a>
        <p id="ember-download-note" className={styles.note}>Downloads Ember_Systems.exe. When it has finished downloading, open the installer yourself to continue with setup.</p>
      </article>

      <article className={`pilot-profile-card ${rulesStyles.card}`}>
        <div>
          <span className="pilot-profile-kicker">PILOT MEMBERSHIP</span>
          <h2>Pilot Rules</h2>
          <p>The operational standards for BAV bookings, Ember, registrations, flight reporting and community conduct.</p>
        </div>
        <div className={`${rulesStyles.status}${pilotRulesAcceptedAt ? "" : ` ${rulesStyles.statusPending}`}`}>
          <strong>{pilotRulesAcceptedAt ? "Accepted" : "Existing pilot account"}</strong>
          <span>{pilotRulesAcceptedAt ? `Accepted ${new Date(pilotRulesAcceptedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}${pilotRulesVersion ? ` · Rules version ${pilotRulesVersion}` : ""}` : "New pilot accounts must accept the current Pilot Rules during registration."}</span>
        </div>
        <a className={rulesStyles.link} href="/pilot-rules">Read BAV Pilot Rules &amp; Operational Standards →</a>
      </article>
    </div>
  );
}
