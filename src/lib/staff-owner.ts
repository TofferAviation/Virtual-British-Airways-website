// The founding Staff Centre owner is intentionally a stable identity in the
// application rather than a mutable host setting. Authentication still
// requires either the owner pilot session or a server-side password; no secret
// is stored in source control.
export const MASTER_ADMIN_EMAIL = "razergamerhd1991@outlook.com";

export function getMasterAdminEmail() {
  return MASTER_ADMIN_EMAIL;
}

export function getConfiguredStaffOwnerEmails() {
  return [MASTER_ADMIN_EMAIL];
}

export function isConfiguredStaffOwner(email: string) {
  const normalized = email.trim().toLowerCase();
  return getConfiguredStaffOwnerEmails().includes(normalized);
}
