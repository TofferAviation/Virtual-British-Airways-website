export const PREVIEW_ACCESS_COOKIE = "bav_preview_access";

const PREVIEW_TOKEN_SALT = "bav-preview-access-v1";

export function previewProtectionEnabled() {
  return process.env.BAV_PREVIEW_PROTECTION?.trim().toLowerCase() === "true";
}

export function getPreviewPassword() {
  return process.env.BAV_PREVIEW_PASSWORD ?? "";
}

export function previewPasswordConfigured() {
  return getPreviewPassword().length > 0;
}

export async function getPreviewAccessToken(password = getPreviewPassword()) {
  if (!password) return "";

  const payload = new TextEncoder().encode(`${PREVIEW_TOKEN_SALT}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", payload);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
