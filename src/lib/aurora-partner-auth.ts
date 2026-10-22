import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

function suppliedKey(request: NextRequest) {
  const authorization = request.headers.get("authorization")?.trim();
  if (authorization?.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim();
  return request.headers.get("x-bav-aurora-key")?.trim() ?? "";
}

function equal(left: string, right: string) {
  const expected = Buffer.from(left);
  const supplied = Buffer.from(right);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function configuredKeys() {
  return (process.env.BAV_AURORA_PARTNER_API_KEYS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export type AuroraPartnerAuthentication =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

/**
 * Authorises read-only access to BAV's normalized NOAA aurora payload.
 * Partner keys must stay on the partner's server; a browser-visible key can
 * be copied and is not access control.
 */
export function authenticateAuroraPartner(request: NextRequest): AuroraPartnerAuthentication {
  const keys = configuredKeys();
  if (!keys.length) return { ok: false, status: 503, error: "Aurora partner API is not configured." };
  const supplied = suppliedKey(request);
  if (!supplied || !keys.some((key) => equal(key, supplied))) {
    return { ok: false, status: 401, error: "Valid Aurora partner API authentication is required." };
  }
  return { ok: true };
}
