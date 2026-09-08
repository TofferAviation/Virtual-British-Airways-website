"use client";

import { FormEvent, useMemo, useState } from "react";
import type { StaffRoleTemplate } from "@/lib/permissions";
import styles from "./add-staff-member.module.css";

type Props = {
  roles: StaffRoleTemplate[];
  canManageUsers: boolean;
};

export function AddStaffMemberForm({ roles, canManageUsers }: Props) {
  const defaultRole = useMemo(() => roles.find((role) => role.id === "support") ?? roles[0], [roles]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(defaultRole?.id ?? "support");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageUsers || busy) return;
    setBusy(true);
    setMessage("");
    setSuccess(false);

    try {
      const response = await fetch("/api/staff/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, roleId, status }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; user?: { name?: string } };
      if (!response.ok) throw new Error(body.error || "Could not create staff account.");

      setSuccess(true);
      setMessage(`${body.user?.name || name} can now sign in through Staff Centre.`);
      setName("");
      setEmail("");
      setPassword("");
      setStatus("active");
      setRoleId(defaultRole?.id ?? "support");

      window.setTimeout(() => {
        window.location.assign("/staff/permissions");
      }, 650);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create staff account.");
    } finally {
      setBusy(false);
    }
  }

  if (!canManageUsers) return null;

  return (
    <section className={styles.panel} aria-labelledby="add-staff-title">
      <div className={styles.headingRow}>
        <div>
          <span className={styles.kicker}>Staff accounts</span>
          <h2 id="add-staff-title">Add staff member</h2>
          <p>Create a real Staff Centre login without editing <code>.env.local</code>.</p>
        </div>
        <button className={styles.toggleButton} type="button" onClick={() => setOpen((value) => !value)}>
          {open ? "Close" : "+ Add staff member"}
        </button>
      </div>

      {open ? (
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.grid}>
            <label>
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
            </label>
            <label>
              <span>Staff email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
            </label>
            <label>
              <span>Temporary password</span>
              <input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" />
              <small>Minimum 8 characters. Send this to the staff member securely.</small>
            </label>
            <label>
              <span>Role</span>
              <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
              <small>The role provides the initial permission set.</small>
            </label>
            <label>
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as "active" | "inactive")}>
                <option value="active">Active — can sign in immediately</option>
                <option value="inactive">Inactive — account created but blocked</option>
              </select>
            </label>
          </div>

          <div className={styles.permissionNote}>
            <strong>Permissions</strong>
            <span>After creation, the new account appears in the User Permissions list below. Select the user there to fine-tune individual permission switches. Protected Service Settings access is never granted from this form.</span>
          </div>

          {message ? (
            <div className={success ? styles.success : styles.error} role="status">{message}</div>
          ) : null}

          <div className={styles.actions}>
            <button className={styles.primary} type="submit" disabled={busy}>{busy ? "Creating…" : "Create staff account"}</button>
            <button className={styles.secondary} type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
