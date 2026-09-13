// The founding Staff Centre owner is intentionally a stable identity in the
// application rather than a mutable host setting. Authentication still
// requires either the owner pilot session or a server-side password; no secret
// is stored in source control.
export const MASTER_ADMIN_EMAIL = "razergamerhd1991@outlook.com";

export function getMasterAdminEmail() {
  return MASTER_ADMIN_EMAIL;
}

/**
 * The permanent founding owner is kept in source, while an existing deployment
 * may still have a legacy owner email configured in its host settings. Accept
 * both identities during the transition so a production setting cannot lock
 * the owner out of the same account system that works locally.
 */
export function getConfiguredStaffOwnerEmails() {
  const legacyOwner = process.env.BAV_STAFF_EMAIL?.trim().toLowerCase();
  return [...new Set([MASTER_ADMIN_EMAIL, legacyOwner].filter((value): value is string => Boolean(value)))];
}

export function isConfiguredStaffOwner(email: string) {
  const normalized = email.trim().toLowerCase();
  return getConfiguredStaffOwnerEmails().includes(normalized);
}
