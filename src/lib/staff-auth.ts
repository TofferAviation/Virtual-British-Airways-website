import { redirect } from "next/navigation";
import type { PermissionId, StaffRoleId } from "@/lib/permissions";
import { getPilotSession } from "@/lib/pilot-auth";
import {
  getStaffState,
  hasPermission,
  isMasterAdminAccount,
  type StaffAccount,
} from "@/lib/staff-store";

/**
 * Staff Centre deliberately has no separate password, cookie, or recovery
 * credential. A Staff session is a permission view of an already authenticated
 * BAV pilot account and is rebuilt for every request.
 */
export type StaffSession = {
  userId: string;
  email: string;
  name: string;
  roleId: StaffRoleId;
  isMasterAdmin: boolean;
  exp: number;
};

function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

function sessionFor(account: StaffAccount, pilotExpiry: number): StaffSession {
  return {
    userId: account.id,
    email: normaliseEmail(account.email),
    name: account.name,
    roleId: account.roleId,
    isMasterAdmin: isMasterAdminAccount(account),
    // Staff access can never outlive the pilot session from which it was made.
    exp: pilotExpiry,
  };
}

/**
 * Resolve Staff Centre access from the current BAV pilot session and the
 * persistent role record. This is the sole authorization path for every
 * Staff page and API route.
 */
export async function getStaffSession(): Promise<StaffSession | null> {
  const pilot = await getPilotSession();
  if (!pilot) return null;

  const state = await getStaffState();
  const account = state.users.find((user) =>
    user.status === "active" && normaliseEmail(user.email) === normaliseEmail(pilot.email),
  );
  return account ? sessionFor(account, pilot.exp) : null;
}

export async function staffHasPermission(permission: PermissionId) {
  const session = await getStaffSession();
  if (!session) return false;
  const state = await getStaffState();
  const account = state.users.find((user) => user.id === session.userId);
  return Boolean(account && hasPermission(state, account, permission));
}

export async function requireStaffSession() {
  const session = await getStaffSession();
  if (!session) redirect("/login?returnTo=%2Fstaff");
  return session;
}

export async function requireStaffPermission(permission: PermissionId) {
  const session = await requireStaffSession();
  const state = await getStaffState();
  const account = state.users.find((user) => user.id === session.userId);
  if (!account || !hasPermission(state, account, permission)) redirect("/staff?denied=permissions");
  return session;
}
