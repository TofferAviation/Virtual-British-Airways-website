"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  allPermissions,
  effectivePermissions,
  permissionDependencies,
  permissionGroups,
  rolePermissions,
  type PermissionId,
  type StaffRoleId,
  type StaffRoleTemplate,
} from "@/lib/permissions";

type StaffUser = {
  id: string;
  pilotId?: string;
  name: string;
  email: string;
  roleId: StaffRoleId;
  status: "active" | "invited" | "inactive";
  overrides: Partial<Record<PermissionId, boolean>>;
  isEnvironmentAdmin?: boolean;
  createdAt: string;
  lastActiveAt?: string;
};

type Invitation = {
  id: string;
  email: string;
  name: string;
  roleId: StaffRoleId;
  message?: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
  expiresAt: string;
  invitedBy: string;
};

type AuditEntry = {
  id: string;
  at: string;
  actorEmail: string;
  actorName: string;
  action: string;
  targetUserId?: string;
  targetName?: string;
  details: string;
};

type Props = {
  initialUsers: StaffUser[];
  initialRoles: StaffRoleTemplate[];
  initialInvitations: Invitation[];
  initialAudit: AuditEntry[];
  currentUserId: string;
  currentPermissions: PermissionId[];
};

type BootstrapResponse = {
  users: StaffUser[];
  roles: StaffRoleTemplate[];
  invitations: Invitation[];
  audit: AuditEntry[];
  currentUserId: string;
  currentPermissions: PermissionId[];
};

function formatDate(value?: string, withTime = false) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "UTC",
  }).format(date);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "S";
}

function roleIcon(id: string) {
  if (id === "admin") return "♛";
  if (id === "operations") return "⚙";
  if (id === "events") return "▣";
  if (id === "support") return "◉";
  if (id === "content-editor") return "▤";
  if (id === "moderator") return "◎";
  return "◇";
}

function permissionCountLast30Days(audit: AuditEntry[]) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return audit.filter((entry) => entry.action.startsWith("permissions.") && new Date(entry.at).getTime() >= cutoff).length;
}

function roleById(roles: StaffRoleTemplate[], id: StaffRoleId) {
  return roles.find((role) => role.id === id);
}

function normalizedOverridesForDesired(
  role: StaffRoleTemplate | undefined,
  desired: Set<PermissionId>,
) {
  const base = rolePermissions(role);
  const overrides: Partial<Record<PermissionId, boolean>> = {};
  for (const permission of allPermissions) {
    const wanted = desired.has(permission);
    const defaultValue = base.has(permission);
    if (wanted !== defaultValue) overrides[permission] = wanted;
  }
  return overrides;
}

function collectDependents(permission: PermissionId) {
  const result = new Set<PermissionId>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of allPermissions) {
      if (result.has(candidate)) continue;
      const dependencies = permissionDependencies[candidate] ?? [];
      if (dependencies.includes(permission) || dependencies.some((dependency) => result.has(dependency))) {
        result.add(candidate);
        changed = true;
      }
    }
  }
  return result;
}

export function UserPermissionsClient({
  initialUsers,
  initialRoles,
  initialInvitations,
  initialAudit,
  currentUserId,
  currentPermissions,
}: Props) {
  const [users, setUsers] = useState(initialUsers);
  const [roles, setRoles] = useState(initialRoles);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [audit, setAudit] = useState(initialAudit);
  const [myPermissions, setMyPermissions] = useState(new Set(currentPermissions));
  const [selectedId, setSelectedId] = useState(initialUsers.find((user) => !user.isEnvironmentAdmin)?.id ?? currentUserId);
  const [draftRoleId, setDraftRoleId] = useState<StaffRoleId>(() => initialUsers.find((user) => user.id === (initialUsers.find((item) => !item.isEnvironmentAdmin)?.id ?? currentUserId))?.roleId ?? "admin");
  const [draftOverrides, setDraftOverrides] = useState<Partial<Record<PermissionId, boolean>>>(() => initialUsers.find((user) => user.id === (initialUsers.find((item) => !item.isEnvironmentAdmin)?.id ?? currentUserId))?.overrides ?? {});
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteResult, setInviteResult] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<StaffRoleId>("events");
  const [inviteMessage, setInviteMessage] = useState("");
  const [invitationsOpen, setInvitationsOpen] = useState(false);
  const [roleModal, setRoleModal] = useState<StaffRoleTemplate | "new" | null>(null);
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [roleDraftPermissions, setRoleDraftPermissions] = useState<Set<PermissionId>>(new Set());

  const selected = users.find((user) => user.id === selectedId) ?? users[0];
  const draftRole = roleById(roles, draftRoleId);
  const effectiveDraft = useMemo(() => effectivePermissions(draftRole, draftOverrides), [draftRole, draftOverrides]);
  const savedEffective = useMemo(() => selected ? effectivePermissions(roleById(roles, selected.roleId), selected.overrides) : new Set<PermissionId>(), [roles, selected]);

  const canManageUsers = myPermissions.has("users.roles");
  const canManageRoles = myPermissions.has("settings.roles");
  const canAudit = myPermissions.has("settings.audit");

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== "all" && user.roleId !== roleFilter) return false;
      if (statusFilter !== "all" && user.status !== statusFilter) return false;
      if (!query) return true;
      return `${user.name} ${user.email} ${roleById(roles, user.roleId)?.name ?? user.roleId}`.toLowerCase().includes(query);
    });
  }, [users, roles, roleFilter, statusFilter, search]);

  const activeRoles = roles.filter((role) => users.some((user) => user.status === "active" && user.roleId === role.id)).length;
  const pendingInvitations = invitations.filter((invite) => invite.status === "pending").length;

  function showMasterAdminMessage() {
    setMessage("Master Admin has every permission permanently granted. These switches are locked ON so the recovery account can never be locked out.");
  }

  function selectUser(user: StaffUser) {
    setSelectedId(user.id);
    setDraftRoleId(user.roleId);
    setDraftOverrides({ ...user.overrides });
    setMessage("");
  }

  function togglePermission(permission: PermissionId) {
    if (!selected || !canManageUsers) return;
    if (selected.isEnvironmentAdmin) {
      showMasterAdminMessage();
      return;
    }
    const desired = new Set(effectiveDraft);
    if (desired.has(permission)) {
      desired.delete(permission);
      for (const dependent of collectDependents(permission)) desired.delete(dependent);
    } else {
      desired.add(permission);
      for (const dependency of permissionDependencies[permission] ?? []) desired.add(dependency);
    }
    setDraftOverrides(normalizedOverridesForDesired(draftRole, desired));
  }

  function changeRole(roleId: StaffRoleId) {
    if (!selected || selected.isEnvironmentAdmin || !canManageUsers) return;
    setDraftRoleId(roleId);
    setDraftOverrides({});
  }

  function resetDraft() {
    if (!selected) return;
    setDraftRoleId(selected.roleId);
    setDraftOverrides({ ...selected.overrides });
  }

  function resetToRoleDefaults() {
    if (!selected || !canManageUsers) return;
    if (selected.isEnvironmentAdmin) {
      showMasterAdminMessage();
      return;
    }
    setDraftOverrides({});
  }

  async function refreshData() {
    const response = await fetch("/api/staff/permissions", { cache: "no-store" });
    if (!response.ok) return;
    const body = (await response.json()) as BootstrapResponse;
    setUsers(body.users);
    setRoles(body.roles);
    setInvitations(body.invitations);
    setAudit(body.audit);
    setMyPermissions(new Set(body.currentPermissions));
    const nextSelected = body.users.find((user) => user.id === selectedId) ?? body.users[0];
    if (nextSelected) {
      setSelectedId(nextSelected.id);
      setDraftRoleId(nextSelected.roleId);
      setDraftOverrides({ ...nextSelected.overrides });
    }
  }

  async function saveUserChanges() {
    if (!selected || !canManageUsers) return;
    if (selected.isEnvironmentAdmin) {
      showMasterAdminMessage();
      return;
    }
    const added = allPermissions.filter((permission) => !savedEffective.has(permission) && effectiveDraft.has(permission));
    const removed = allPermissions.filter((permission) => savedEffective.has(permission) && !effectiveDraft.has(permission));
    const roleChanged = selected.roleId !== draftRoleId;
    if (!roleChanged && !added.length && !removed.length) {
      setMessage("No permission changes to save.");
      return;
    }
    const summary = `${roleChanged ? "Role will change.\n" : ""}${added.length} permission${added.length === 1 ? "" : "s"} will be added.\n${removed.length} permission${removed.length === 1 ? "" : "s"} will be removed.`;
    if (!window.confirm(`Update permissions for ${selected.name}?\n\n${summary}`)) return;

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/staff/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-user", userId: selected.id, roleId: draftRoleId, overrides: draftOverrides }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not save permissions.");
      await refreshData();
      setMessage(`Permissions updated for ${selected.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save permissions.");
    } finally {
      setBusy(false);
    }
  }

  async function removeStaffAccess() {
    if (!selected || selected.isEnvironmentAdmin || !canManageUsers) return;
    if (!window.confirm(`Remove staff access from ${selected.name}?\n\nTheir pilot account will remain unchanged.`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/staff/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-staff", userId: selected.id }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not remove staff access.");
      await refreshData();
      setMessage(`Staff access removed from ${selected.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove staff access.");
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite(event: FormEvent) {
    event.preventDefault();
    if (!canManageUsers) return;
    setBusy(true);
    setInviteResult("");
    try {
      const response = await fetch("/api/staff/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", name: inviteName, email: inviteEmail, roleId: inviteRole, message: inviteMessage }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; invitationUrl?: string };
      if (!response.ok) throw new Error(body.error || "Could not create invitation.");
      setInviteResult(body.invitationUrl || "Invitation created.");
      await refreshData();
    } catch (error) {
      setInviteResult(error instanceof Error ? error.message : "Could not create invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvitation(id: string) {
    if (!window.confirm("Revoke this pending staff invitation?")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/staff/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke-invitation", invitationId: id }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Could not revoke invitation.");
      }
      await refreshData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke invitation.");
    } finally {
      setBusy(false);
    }
  }

  function openRoleEditor(role: StaffRoleTemplate | "new") {
    setRoleModal(role);
    if (role === "new") {
      setRoleName("");
      setRoleDescription("");
      setRoleDraftPermissions(new Set());
    } else {
      setRoleName(role.name);
      setRoleDescription(role.description);
      setRoleDraftPermissions(new Set(role.permissions));
    }
  }

  function toggleRolePermission(permission: PermissionId) {
    if (!canManageRoles || (roleModal !== "new" && roleModal?.id === "admin")) return;
    const next = new Set(roleDraftPermissions);
    if (next.has(permission)) {
      next.delete(permission);
      for (const dependent of collectDependents(permission)) next.delete(dependent);
    } else {
      next.add(permission);
      for (const dependency of permissionDependencies[permission] ?? []) next.add(dependency);
    }
    setRoleDraftPermissions(next);
  }

  async function saveRole(event: FormEvent) {
    event.preventDefault();
    if (!canManageRoles || !roleModal) return;
    setBusy(true);
    try {
      const action = roleModal === "new" ? "create-role" : "update-role";
      const response = await fetch("/api/staff/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          roleId: roleModal === "new" ? undefined : roleModal.id,
          name: roleName,
          description: roleDescription,
          permissions: [...roleDraftPermissions],
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not save role.");
      await refreshData();
      setRoleModal(null);
      setMessage(roleModal === "new" ? "Role created." : "Role template updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save role.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="permissions-hero">
        <div className="permissions-shell permissions-hero-inner">
          <div className="permissions-hero-copy">
            <span className="permissions-kicker">User permissions</span>
            <h1>Control access across<br />the virtual airline.</h1>
            <p>Assign roles, manage access levels, invite staff members and review permission changes. Keep your virtual airline secure, organised and running smoothly.</p>
            <button className="permissions-primary" onClick={() => setInviteOpen(true)} disabled={!canManageUsers}>Invite staff member <span>→</span></button>
          </div>
          <aside className="permissions-overview">
            <div className="permissions-overview-head"><h2>Permissions overview</h2><span>Live staff data</span></div>
            <div className="permissions-overview-grid">
              <button onClick={() => document.getElementById("staff-accounts")?.scrollIntoView({ behavior: "smooth" })}><span>◎</span><strong>{users.length}</strong><small>Total staff accounts</small><em>View all users →</em></button>
              <button onClick={() => document.getElementById("role-overview")?.scrollIntoView({ behavior: "smooth" })}><span>◇</span><strong>{activeRoles}</strong><small>Active roles</small><em>Manage roles →</em></button>
              <button onClick={() => setInvitationsOpen(true)}><span>♙</span><strong>{pendingInvitations}</strong><small>Pending invitations</small><em>View invitations →</em></button>
              <button onClick={() => document.getElementById("permissions-audit")?.scrollIntoView({ behavior: "smooth" })}><span>▤</span><strong>{permissionCountLast30Days(audit)}</strong><small>Permission changes<br />(last 30 days)</small><em>View audit log →</em></button>
            </div>
          </aside>
        </div>
      </section>

      {message ? <div className="permissions-shell permissions-message" role="status">{message}<button onClick={() => setMessage("")}>×</button></div> : null}

      <div className="permissions-shell permissions-main-grid">
        <div className="permissions-left-column">
          <section className="permissions-panel" id="staff-accounts">
            <div className="permissions-panel-head"><div><span className="permissions-kicker">Staff accounts</span><p>Manage staff members and their access levels.</p></div></div>
            <div className="permissions-filters">
              <label className="permissions-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email or role..." /></label>
              <label><span>Filter by role</span><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All roles</option>{roles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}</select></label>
              <label><span>Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All users</option><option value="active">Active</option><option value="invited">Invited</option><option value="inactive">Inactive</option></select></label>
            </div>
            <div className="permissions-table-wrap">
              <table className="permissions-table">
                <thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Status</th><th>Last active</th><th>Actions</th></tr></thead>
                <tbody>{filteredUsers.map((user) => <tr key={user.id} className={user.id === selectedId ? "selected" : ""}>
                  <td><span className="permissions-avatar">{initials(user.name)}</span><strong>{user.name}</strong></td>
                  <td>{user.isEnvironmentAdmin ? "Master Admin" : (roleById(roles, user.roleId)?.name ?? user.roleId)}</td>
                  <td>{user.email}</td>
                  <td><span className={`permissions-status ${user.status}`}>{user.status === "active" ? "Active" : user.status === "invited" ? "Invited" : "Inactive"}</span></td>
                  <td>{formatDate(user.lastActiveAt)}</td>
                  <td><button className="permissions-edit" onClick={() => selectUser(user)}>Edit <span>→</span></button></td>
                </tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="permissions-panel permissions-editor">
            <div className="permissions-panel-head permissions-editor-head">
              <div><span className="permissions-kicker">Edit user permissions</span><p>Select a user to view and edit their permissions.</p></div>
              <button className="permissions-link-button" onClick={resetToRoleDefaults} disabled={!selected || !canManageUsers}>↻ Reset to role defaults</button>
            </div>
            {selected ? <>
              <div className="permissions-user-summary">
                <span className="permissions-avatar large">{initials(selected.name)}</span>
                <div><h2>{selected.name}</h2><p>{selected.email} <span>·</span> Last active: {formatDate(selected.lastActiveAt, true)}</p></div>
                <span className={`permissions-status ${selected.status}`}>{selected.status === "active" ? "Active" : selected.status === "invited" ? "Invited" : "Inactive"}</span>
                <label><span>Role</span><select value={draftRoleId} onChange={(event) => changeRole(event.target.value as StaffRoleId)} disabled={!canManageUsers || selected.isEnvironmentAdmin}>{roles.map((role) => <option key={role.id} value={role.id}>{selected.isEnvironmentAdmin && role.id === "admin" ? "Master Admin" : role.name}</option>)}</select></label>
              </div>
              {selected.isEnvironmentAdmin ? <div className="permissions-admin-lock"><strong>Master Admin — full access active.</strong> All {allPermissions.length} permissions below are permanently ON for this recovery account. Click any switch to confirm its status; it cannot be disabled or demoted.</div> : null}
              <div className="permissions-groups">
                {permissionGroups.map((group) => <article className="permissions-group" key={group.id}>
                  <header><span>{group.icon}</span><strong>{group.label}</strong></header>
                  {group.permissions.map((permission) => {
                    const granted = selected.isEnvironmentAdmin ? true : effectiveDraft.has(permission.id);
                    const custom = !selected.isEnvironmentAdmin && Object.prototype.hasOwnProperty.call(draftOverrides, permission.id);
                    return <div className="permissions-row" key={permission.id} title={permission.description}>
                      <span>{permission.label}{selected.isEnvironmentAdmin ? <em>Master</em> : custom ? <em>Custom</em> : null}{permission.highLevel ? <b title="High-level permission">!</b> : null}</span>
                      <button
                        type="button"
                        className={`permissions-switch ${granted ? "on" : ""} ${selected.isEnvironmentAdmin ? "master-locked" : ""}`}
                        role="switch"
                        aria-checked={granted}
                        aria-label={`${permission.label}: ${selected.isEnvironmentAdmin ? "permanently granted to Master Admin" : granted ? "granted" : "denied"}`}
                        onClick={() => togglePermission(permission.id)}
                        disabled={!canManageUsers}
                        title={selected.isEnvironmentAdmin ? "Master Admin permission — permanently granted" : permission.description}
                      ><i /></button>
                    </div>;
                  })}
                </article>)}
              </div>
              <div className="permissions-editor-actions">
                <button className="permissions-primary" onClick={saveUserChanges} disabled={busy || !canManageUsers}>{selected.isEnvironmentAdmin ? "Full access active" : "Save changes"}</button>
                <button className="permissions-secondary" onClick={resetDraft} disabled={busy}>Reset changes</button>
                <button className="permissions-danger" onClick={removeStaffAccess} disabled={busy || !canManageUsers || selected.isEnvironmentAdmin || selected.id === currentUserId}>Remove staff access</button>
              </div>
            </> : <p>No staff accounts are available.</p>}
          </section>
        </div>

        <div className="permissions-right-column">
          <section className="permissions-panel" id="role-overview">
            <div className="permissions-panel-head role-heading"><div><span className="permissions-kicker">Role overview</span><p>Number of users in each role and quick actions.</p></div><div><button className="permissions-primary small" onClick={() => openRoleEditor("new")} disabled={!canManageRoles}>Create role +</button><button className="permissions-secondary small" onClick={() => setInviteOpen(true)} disabled={!canManageUsers}>Invite staff +</button></div></div>
            <div className="permissions-role-list">{roles.map((role) => <button key={role.id} onClick={() => openRoleEditor(role)} disabled={!canManageRoles && role.id !== "admin"}><span>{roleIcon(role.id)}</span><strong>{role.name}</strong><em>{users.filter((user) => user.status === "active" && user.roleId === role.id).length}</em><small>{role.description}</small><i>{canManageRoles ? "Manage →" : "View"}</i></button>)}</div>
          </section>

          <section className="permissions-panel">
            <div className="permissions-panel-head"><div><span className="permissions-kicker">Role templates</span><p>Use pre-configured roles to quickly assign common permissions.</p></div></div>
            <div className="permissions-role-cards">{roles.slice(0, 6).map((role) => <button key={role.id} onClick={() => openRoleEditor(role)}><span>{roleIcon(role.id)}</span><strong>{role.name}</strong><small>{role.description}</small><em>{role.permissions.length} permissions</em></button>)}</div>
          </section>

          <section className="permissions-panel" id="permissions-audit">
            <div className="permissions-panel-head"><div><span className="permissions-kicker">Recent permission changes</span><p>A log of the most recent permission updates.</p></div></div>
            {canAudit ? <div className="permissions-audit-list">{audit.slice(0, 8).map((entry) => <div key={entry.id}><time>{formatDate(entry.at, true)}</time><strong>{entry.targetName ?? "Staff system"}</strong><span>{entry.details}</span><em>{entry.actorName}</em></div>)}{!audit.length ? <p>No permission changes have been recorded yet.</p> : null}</div> : <div className="permissions-no-access">You do not have permission to view the audit log.</div>}
          </section>

          <section className="permissions-how">
            <span>▢</span><div><strong>How permissions work</strong><p><b>1.</b> Roles provide defaults. <b>2.</b> Individual overrides fine-tune access. <b>3.</b> Every change is recorded in the audit log.</p></div><a href="/help">Go to help centre →</a>
          </section>
        </div>
      </div>

      {inviteOpen ? <div className="permissions-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setInviteOpen(false)}><section className="permissions-modal">
        <header><div><span className="permissions-kicker">Invite staff</span><h2>Invite staff member</h2></div><button onClick={() => setInviteOpen(false)}>×</button></header>
        <form onSubmit={sendInvite} className="permissions-modal-form">
          <label><span>Name</span><input value={inviteName} onChange={(event) => setInviteName(event.target.value)} placeholder="Existing BAV pilot name" required /></label>
          <label><span>Email</span><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="pilot@example.com" required /></label>
          <label><span>Role</span><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as StaffRoleId)}>{roles.map((role) => <option value={role.id} key={role.id}>{role.name}</option>)}</select></label>
          <label className="wide"><span>Optional message</span><textarea rows={3} value={inviteMessage} onChange={(event) => setInviteMessage(event.target.value)} /></label>
          {inviteResult ? <div className="permissions-invite-result"><strong>{inviteResult.startsWith("http") ? "Invitation link" : "Status"}</strong><p>{inviteResult}</p>{inviteResult.startsWith("http") ? <button type="button" onClick={() => navigator.clipboard.writeText(inviteResult)}>Copy link</button> : null}</div> : null}
          <div className="permissions-modal-actions"><button type="button" className="permissions-secondary" onClick={() => setInviteOpen(false)}>Close</button><button type="submit" className="permissions-primary" disabled={busy}>{busy ? "Creating…" : "Create invitation"}</button></div>
        </form>
      </section></div> : null}

      {invitationsOpen ? <div className="permissions-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setInvitationsOpen(false)}><section className="permissions-modal wide-modal">
        <header><div><span className="permissions-kicker">Staff invitations</span><h2>Pending and recent invitations</h2></div><button onClick={() => setInvitationsOpen(false)}>×</button></header>
        <div className="permissions-invitation-list">{invitations.map((invite) => <div key={invite.id}><strong>{invite.name}</strong><span>{invite.email}</span><span>{roleById(roles, invite.roleId)?.name ?? invite.roleId}</span><span className={`permissions-status ${invite.status === "accepted" ? "active" : invite.status === "pending" ? "invited" : "inactive"}`}>{invite.status}</span><time>Expires {formatDate(invite.expiresAt)}</time>{invite.status === "pending" ? <button onClick={() => revokeInvitation(invite.id)} disabled={busy}>Revoke</button> : <span />}</div>)}{!invitations.length ? <p>No staff invitations yet.</p> : null}</div>
      </section></div> : null}

      {roleModal ? <div className="permissions-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setRoleModal(null)}><section className="permissions-modal role-modal">
        <header><div><span className="permissions-kicker">Role template</span><h2>{roleModal === "new" ? "Create role" : `Manage ${roleModal.name}`}</h2></div><button onClick={() => setRoleModal(null)}>×</button></header>
        <form onSubmit={saveRole} className="permissions-modal-form">
          <label><span>Role name</span><input value={roleName} onChange={(event) => setRoleName(event.target.value)} required disabled={roleModal !== "new" && roleModal.id === "admin"} /></label>
          <label className="wide"><span>Description</span><input value={roleDescription} onChange={(event) => setRoleDescription(event.target.value)} disabled={roleModal !== "new" && roleModal.id === "admin"} /></label>
          <div className="permissions-role-permissions wide">{permissionGroups.map((group) => <div key={group.id}><strong>{group.label}</strong>{group.permissions.map((permission) => <label key={permission.id}><input type="checkbox" checked={roleDraftPermissions.has(permission.id)} onChange={() => toggleRolePermission(permission.id)} disabled={roleModal !== "new" && roleModal.id === "admin"} /><span>{permission.label}</span></label>)}</div>)}</div>
          <div className="permissions-modal-actions"><button type="button" className="permissions-secondary" onClick={() => setRoleModal(null)}>Close</button><button type="submit" className="permissions-primary" disabled={busy || (roleModal !== "new" && roleModal.id === "admin")}>{busy ? "Saving…" : "Save role"}</button></div>
        </form>
      </section></div> : null}
    </>
  );
}