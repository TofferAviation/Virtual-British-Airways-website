/**
 * Profile avatars are stored with the account state, rather than as arbitrary
 * remote URLs. The browser converts a chosen image to this compact format
 * before sending it here.
 */
export const MAX_PROFILE_IMAGE_DATA_LENGTH = 350_000;

const PROFILE_IMAGE_PATTERN = /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/;

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
