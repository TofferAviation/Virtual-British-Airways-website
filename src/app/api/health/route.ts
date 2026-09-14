import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { emailDeliveryHealth } from "@/lib/email";
import { isSimbriefApiConfigured } from "@/lib/simbrief";

type PersistenceCheck = {
  configured: boolean;
  keyKind: "secret" | "legacy-service-role" | "public-or-unrecognised" | "missing";
  status: "ready" | "unavailable" | "not-configured";
  errorCode?: string;
};

type FleetCheck = PersistenceCheck & {
  organization: "present" | "missing" | "unknown";
  aircraftCount?: number;
  requiredTables?: Record<"memberships" | "assignments" | "acarsSessions" | "positionReports", "ready" | "unavailable">;
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

/**
 * Fleet is used by Ember before a flight can start.  Keep this probe
 * read-only: the normal Fleet API remains responsible for its one-time BAV
 * organization bootstrap.  The public result deliberately exposes only a
 * coarse readiness state and total aircraft count, never IDs or account data.
 */
async function checkFleetPersistence(): Promise<FleetCheck> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return { configured: false, keyKind: "missing", status: "not-configured", organization: "unknown" };
  }

  const keyKind = key.startsWith("sb_secret_")
    ? "secret"
    : key.startsWith("eyJ")
      ? "legacy-service-role"
      : "public-or-unrecognised";
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const organizationResult = await client
    .from("organizations")
    .select("id")
    .eq("code", "BAV")
    .maybeSingle();
  if (organizationResult.error) {
    return {
      configured: true,
      keyKind,
      status: "unavailable",
      errorCode: organizationResult.error.code ?? "unknown",
      organization: "unknown",
    };
  }
  if (!organizationResult.data?.id) {
    return { configured: true, keyKind, status: "ready", organization: "missing", aircraftCount: 0 };
  }

  const [aircraftResult, membershipsResult, assignmentsResult, acarsSessionsResult, positionReportsResult] = await Promise.all([
    client
      .from("aircraft")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationResult.data.id),
    client.from("organization_memberships").select("id").limit(1),
    client.from("aircraft_flight_assignments").select("id").limit(1),
    client.from("acars_sessions").select("id").limit(1),
    client.from("acars_position_reports").select("id").limit(1),
  ]);
  const requiredTables = {
    memberships: membershipsResult.error ? "unavailable" : "ready",
    assignments: assignmentsResult.error ? "unavailable" : "ready",
    acarsSessions: acarsSessionsResult.error ? "unavailable" : "ready",
    positionReports: positionReportsResult.error ? "unavailable" : "ready",
  } as const;
  if (aircraftResult.error) {
    return {
      configured: true,
      keyKind,
      status: "unavailable",
      errorCode: aircraftResult.error.code ?? "unknown",
      organization: "present",
      requiredTables,
    };
  }
  const firstUnavailable = [
    membershipsResult.error,
    assignmentsResult.error,
    acarsSessionsResult.error,
    positionReportsResult.error,
  ].find(Boolean);
  return {
    configured: true,
    keyKind,
    status: firstUnavailable ? "unavailable" : "ready",
    ...(firstUnavailable ? { errorCode: firstUnavailable.code ?? "unknown" } : {}),
    organization: "present",
    aircraftCount: aircraftResult.count ?? 0,
    requiredTables,
  };
}

export async function GET() {
  const [pilotPersistence, staffPersistence, fleetPersistence] = await Promise.all([
    checkPersistenceTable("pilot_state"),
    checkPersistenceTable("staff_state"),
    checkFleetPersistence(),
  ]);
  return NextResponse.json({
    service: "british-airways-virtual-website",
    status: "ok",
    // This is deliberately a source revision rather than an environment
    // value so the public health endpoint can confirm which authentication
    // release Render is actually serving, without exposing any secret.
    revision: "fleet-connection-diagnostics-v1",
    staffAuthConfigured: Boolean(
      process.env.BAV_STAFF_SESSION_SECRET &&
        process.env.BAV_STAFF_SESSION_SECRET.length >= 24,
    ),
    pilotPersistenceConfigured: pilotPersistence.configured,
    pilotPersistence,
    staffPersistence,
    fleetPersistence,
    emailDelivery: emailDeliveryHealth(),
    simbriefApiConfigured: isSimbriefApiConfigured(),
  });
}
