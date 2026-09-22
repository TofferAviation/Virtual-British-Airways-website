/**
 * Profile avatars are stored with the account state, rather than as arbitrary
 * remote URLs. The browser converts a chosen image to this compact format
 * before sending it here.
 */
export const MAX_PROFILE_IMAGE_DATA_LENGTH = 350_000;
export const MAX_ACCOUNT_BACKGROUND_DATA_LENGTH = 3_250_000;

const PROFILE_IMAGE_PATTERN = /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/;
const ACCOUNT_BACKGROUND_PATTERN = /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/;

export function normaliseStoredProfileImage(value: unknown) {
  return typeof value === "string" && value.length <= MAX_PROFILE_IMAGE_DATA_LENGTH && PROFILE_IMAGE_PATTERN.test(value)
    ? value
    : null;
}

export function validateProfileImage(value: unknown): string | null {
  if (value == null || value === "") return null;
  const image = normaliseStoredProfileImage(value);
  if (!image) {
    throw new Error("Profile photos must be a square WebP image under 250 KB.");
  }
  return image;
}

/** A personal dashboard background is also stored as a locally prepared WebP,
 * never as an arbitrary remote URL. */
export function normaliseStoredAccountBackground(value: unknown) {
  return typeof value === "string" &&
         value.length <= MAX_ACCOUNT_BACKGROUND_DATA_LENGTH &&
         ACCOUNT_BACKGROUND_PATTERN.test(value)
    ? value
    : null;
}

export function validateAccountBackground(value: unknown): string | null {
  if (value == null || value === "") return null;
  const image = normaliseStoredAccountBackground(value);
  if (!image) {
    throw new Error("Dashboard backgrounds must be a compressed WebP image under 2.3 MB.");
  }
  return image;
}
