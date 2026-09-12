// The founding Staff Centre owner is intentionally a stable identity in the
// application rather than a mutable host setting. Authentication still
// requires either the owner pilot session or a server-side password; no secret
// is stored in source control.
export const MASTER_ADMIN_EMAIL = "kris-eriksen@hotmail.com";

export function getMasterAdminEmail() {
  return MASTER_ADMIN_EMAIL;
}
