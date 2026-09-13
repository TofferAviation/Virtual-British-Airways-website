// The founding Staff Centre owner is intentionally a stable identity in the
// application rather than a mutable host setting. Their initial Staff Centre
// password may be set only while this BAV pilot identity is authenticated;
// the resulting staff credential is stored as a one-way hash, never in code.
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
