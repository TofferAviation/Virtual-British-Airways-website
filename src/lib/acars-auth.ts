import { createHmac, timingSafeEqual } from "node:crypto";
import { findPilotByEmail, getPilotById, isAcarsDeviceSessionActive, verifyPilotPassword } from "@/lib/pilot-store";

// Access tokens are intentionally short-lived. A remembered Ember session is
// a separate, revocable device credential held with Windows data protection.
export const ACARS_TOKEN_TTL_SECONDS = 60 * 60 * 12;

export type AcarsAuthToken = {
  pilotId: string;
  pilotNumber: string;
  name: string;
  authVersion: number;
  deviceSessionId?: string;
  exp: number;
};

function secret() {
  const value = process.env.BAV_ACARS_SECRET || process.env.BAV_PILOT_SESSION_SECRET || process.env.BAV_STAFF_SESSION_SECRET;
  if (!value || value.length < 24) throw new Error("BAV_ACARS_SECRET or BAV_PILOT_SESSION_SECRET must be at least 24 characters long.");
  return value;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function authenticateAcarsPilot(email: string, password: string) {
  const account = await findPilotByEmail(email);
  if (!account || account.status !== "active" || !verifyPilotPassword(password, account.passwordHash)) return null;
  return account;
}

export function createAcarsToken(
  input: { id: string; pilotNumber: string; name: string; authVersion: number },
  deviceSessionId?: string,
) {
  const payload: AcarsAuthToken = {
    pilotId: input.id,
    pilotNumber: input.pilotNumber,
    name: input.name,
    authVersion: input.authVersion,
    ...(deviceSessionId ? { deviceSessionId } : {}),
    exp: Math.floor(Date.now() / 1000) + ACARS_TOKEN_TTL_SECONDS,
  };
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export async function verifyAcarsToken(token?: string | null) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  try {
    if (!safeEqual(signature, sign(payload))) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AcarsAuthToken;
    if (!decoded.pilotId || !Number.isInteger(decoded.authVersion) || decoded.exp <= Math.floor(Date.now() / 1000)) return null;
    const account = await getPilotById(decoded.pilotId);
    if (!account || account.status !== "active" || account.authVersion !== decoded.authVersion) return null;
    if (decoded.deviceSessionId && !await isAcarsDeviceSessionActive({
      id: decoded.deviceSessionId,
      pilotId: account.id,
      authVersion: account.authVersion,
    })) return null;
    return { token: decoded, account };
  } catch {
    return null;
  }
}

export async function requireAcarsBearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return verifyAcarsToken(token);
}
