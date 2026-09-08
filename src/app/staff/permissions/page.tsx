import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { requireStaffPermission } from "@/lib/staff-auth";
import { getStaffState, permissionsForUser } from "@/lib/staff-store";
import { AddStaffMemberForm } from "./AddStaffMemberForm";
import { UserPermissionsClient } from "./UserPermissionsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "User Permissions",
  description: "Manage British Airways Virtual staff roles and access permissions.",
};

export default async function StaffPermissionsPage() {
  const session = await requireStaffPermission("users.view");
  const state = await getStaffState();
  const currentUser = state.users.find((user) => user.id === session.userId)!;
  const safeUsers = state.users.map(({ passwordHash: _passwordHash, ...user }) => {
    void _passwordHash;
    return user;
  });
  const safeInvitations = state.invitations.map(({ tokenHash: _tokenHash, ...invitation }) => {
    void _tokenHash;
    return invitation;
  });
  const currentPermissions = [...permissionsForUser(state, currentUser)];
  const canManageUsers = currentPermissions.includes("users.roles");

  return (
    <>
      <SiteHeader />
      <main className="permissions-page">
        <div className="permissions-breadcrumb-band">
          <div className="permissions-shell permissions-breadcrumbs">
            <Link href="/">Home</Link><span>›</span><span>British Airways Virtual</span><span>›</span><Link href="/staff">Manage</Link><span>›</span><strong>User permissions</strong>
          </div>
        </div>
        <AddStaffMemberForm roles={state.roles} canManageUsers={canManageUsers} />
        <UserPermissionsClient
          initialUsers={safeUsers}
          initialRoles={state.roles}
          initialInvitations={safeInvitations}
          initialAudit={state.audit.slice(0, 30)}
          currentUserId={currentUser.id}
          currentPermissions={currentPermissions}
        />
      </main>
      <SiteFooter />
    </>
  );
}
