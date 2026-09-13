import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PersistenceCheck = {
  configured: boolean;
  keyKind: "secret" | "legacy-service-role" | "public-or-unrecognised" | "missing";
  status: "ready" | "unavailable" | "not-configured";
  errorCode?: string;
};

async function checkPersistenceTable(table: "pilot_state" | "staff_state"): Promise<PersistenceCheck> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return { configured: false, keyKind: "missing", status: "not-configured" };
  }

  const keyKind = key.startsWith("sb_secret_")
    ? "secret"
    : key.startsWith("eyJ")
      ? "legacy-service-role"
      : "public-or-unrecognised";
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error } = await client.from(table).select("singleton").limit(1);
  return error
    ? { configured: true, keyKind, status: "unavailable", errorCode: error.code ?? "unknown" }
    : { configured: true, keyKind, status: "ready" };
}

export async function GET() {
  const [pilotPersistence, staffPersistence] = await Promise.all([
    checkPersistenceTable("pilot_state"),
    checkPersistenceTable("staff_state"),
  ]);
  return NextResponse.json({
    service: "british-airways-virtual-website",
    status: "ok",
    // This is deliberately a source revision rather than an environment
    // value so the public health endpoint can confirm which authentication
    // release Render is actually serving, without exposing any secret.
    revision: "email-auth-v1",
    staffAuthConfigured: Boolean(
      process.env.BAV_STAFF_SESSION_SECRET &&
        process.env.BAV_STAFF_SESSION_SECRET.length >= 24,
    ),
    pilotPersistenceConfigured: pilotPersistence.configured,
    pilotPersistence,
    staffPersistence,
  });
}
