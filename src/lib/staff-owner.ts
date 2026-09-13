// The founding BAV pilot is the authority allowed to recover Staff Centre
// access. The Staff Centre username itself is deliberately separate and may
// be configured on the host with BAV_STAFF_EMAIL.
export const MASTER_ADMIN_PILOT_EMAIL = "razergamerhd1991@outlook.com";

function normalise(email?: string) {
  return email?.trim().toLowerCase() ?? "";
}

export function getMasterAdminEmail() {
  return normalise(process.env.BAV_STAFF_EMAIL) || MASTER_ADMIN_PILOT_EMAIL;
}

export function getConfiguredStaffOwnerEmails() {
  return [normalise(process.env.BAV_STAFF_OWNER_PILOT_EMAIL) || MASTER_ADMIN_PILOT_EMAIL];
}

export function isConfiguredStaffOwner(email: string) {
  const normalized = normalise(email);
  return getConfiguredStaffOwnerEmails().includes(normalized);
}
