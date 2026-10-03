import { NextRequest, NextResponse } from "next/server";
import { listFlightCallsignMappings, normalizeCallsignMapping, upsertFlightCallsignMapping } from "@/lib/flight-callsigns";
import { getStaffSession } from "@/lib/staff-auth";
import { addAudit, getStaffState, hasPermission, saveStaffState, type FlightCallsignMapping } from "@/lib/staff-store";

type MappingInput = Parameters<typeof normalizeCallsignMapping>[0];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function csvRows(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell.trim()); cell = ""; }
    else if (character === "\n") { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else if (character !== "\r") cell += character;
  }
  if (quoted) throw new Error("The callsign CSV has an unclosed quoted value.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function canonicalHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mappingFromCsvRow(row: string[], headers: Map<string, number>): MappingInput {
  const value = (...names: string[]) => {
    for (const name of names) {
      const index = headers.get(canonicalHeader(name));
      if (index !== undefined) return row[index] ?? "";
    }
    return "";
  };
  return {
    commercialFlightNumber: value("commercialFlightNumber", "flightNumber"),
    operationalCallsign: value("operationalCallsign", "callsign"),
    departureIata: value("departureIata", "origin", "from"),
    arrivalIata: value("arrivalIata", "destination", "to"),
    validFrom: value("validFrom"),
    validTo: value("validTo"),
    source: value("source") as FlightCallsignMapping["source"],
    confidence: (value("confidence") || "verified") as FlightCallsignMapping["confidence"],
    callsignLastVerifiedAt: value("callsignLastVerifiedAt", "lastVerifiedAt", "verifiedAt"),
    lastSeenAt: value("lastSeenAt") || null,
  };
}

function parseMappings(body: unknown): MappingInput[] {
  if (!body || typeof body !== "object") throw new Error("Provide callsign mappings as JSON or CSV.");
  const payload = body as { mappings?: unknown; csv?: unknown };
  if (Array.isArray(payload.mappings)) return payload.mappings.map((mapping) => mapping as MappingInput);
  if (typeof payload.csv === "string") {
    if (payload.csv.length > 750_000) throw new Error("The callsign import is too large. Split it into smaller files.");
    const rows = csvRows(payload.csv);
    if (rows.length < 2) throw new Error("Paste a CSV header and at least one callsign mapping.");
    const headers = new Map(rows[0].map((header, index) => [canonicalHeader(header), index]));
    const required = ["flightNumber", "callsign", "origin", "destination", "validFrom", "validTo", "source"];
    const missing = required.filter((name) => !headers.has(canonicalHeader(name)) && !(name === "flightNumber" && headers.has("commercialflightnumber")) && !(name === "callsign" && headers.has("operationalcallsign")) && !(name === "origin" && headers.has("departureiata")) && !(name === "destination" && headers.has("arrivaliata")));
    if (missing.length) throw new Error(`The callsign CSV is missing: ${missing.join(", ")}.`);
    return rows.slice(1).map((row, index) => {
      try { return mappingFromCsvRow(row, headers); }
      catch (error) { throw new Error(`CSV row ${index + 2}: ${error instanceof Error ? error.message : "Invalid mapping."}`); }
    });
  }
  throw new Error("Provide a mappings JSON array or a CSV string.");
}

async function authorize(edit = false) {
  const session = await getStaffSession();
  if (!session) return { denied: NextResponse.json({ error: "Staff authentication required." }, { status: 401 }) };
  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  const permission = edit ? "routes.edit" : "routes.view";
  if (!actor || !hasPermission(state, actor, permission)) return { denied: NextResponse.json({ error: `Permission required: ${permission}.` }, { status: 403 }) };
  return { state, actor };
}

export async function GET() {
  const auth = await authorize();
  if ("denied" in auth) return auth.denied;
  return NextResponse.json({ mappings: await listFlightCallsignMappings() });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(true);
  if ("denied" in auth) return auth.denied;
  try {
    const mappings = parseMappings(await request.json());
    if (!mappings.length) throw new Error("Provide at least one callsign mapping.");
    if (mappings.length > 2_000) throw new Error("Import at most 2,000 callsign mappings at a time.");
    const saved = [];
    for (const input of mappings) saved.push(await upsertFlightCallsignMapping(input));
    const state = await getStaffState();
    addAudit(state, { actorEmail: auth.actor.email, actorName: auth.actor.name, action: "route.callsign_mappings_imported", details: `Imported or updated ${saved.length} dated operational callsign mapping${saved.length === 1 ? "" : "s"}.` });
    await saveStaffState(state);
    return NextResponse.json({ mappings: saved, imported: saved.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import callsign mappings." }, { status: 400 });
  }
}
