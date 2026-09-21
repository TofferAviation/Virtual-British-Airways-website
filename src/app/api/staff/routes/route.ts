import { NextRequest, NextResponse } from "next/server";
import {
  createManagedRoute,
  deleteManagedRoute,
  getManagedRoutes,
  saveManagedRoutes,
  updateManagedRoute,
  type ManagedRoute,
} from "@/lib/route-store";
import type { PermissionId } from "@/lib/permissions";
import { getStaffSession } from "@/lib/staff-auth";
import { addAudit, getStaffState, hasPermission, saveStaffState } from "@/lib/staff-store";

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function date(value: unknown) {
  const candidate = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : undefined;
}

function time(value: unknown) {
  const candidate = text(value);
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(candidate) ? candidate : undefined;
}

function baFlightNumber(value: unknown) {
  const candidate = text(value).toUpperCase().replace(/\s+/g, "");
  return /^BA\d{1,4}$/.test(candidate) ? candidate : undefined;
}

function bavVirtualFlightNumber(value: unknown) {
  const candidate = text(value).toUpperCase().replace(/\s+/g, "");
  return /^BAV\d{3,5}$/.test(candidate) ? candidate : undefined;
}

function callsign(value: unknown) {
  const candidate = text(value).toUpperCase().replace(/\s+/g, "");
  // BAW is BA's ICAO designator.  A small alpha suffix is allowed for a
  // tracker-confirmed operational callsign such as BAW26PV.
  return /^BAW\d{1,4}[A-Z]{0,2}$/.test(candidate) ? candidate : undefined;
}

function aircraftList(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return items.length ? Array.from(new Set(items)) : undefined;
}

function operatingDays(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const days = value.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6);
  return days.length ? Array.from(new Set(days)) : undefined;
}

function normalizeRoute(input: unknown, existingId?: string): ManagedRoute {
  if (!input || typeof input !== "object") throw new Error("Invalid route payload.");
  const raw = input as Record<string, unknown>;
  const from = text(raw.from).toUpperCase();
  const to = text(raw.to).toUpperCase();
  const virtualTimetable = bool(raw.virtualTimetable, false);
  const flightNumber = virtualTimetable ? bavVirtualFlightNumber(raw.flightNumber) : baFlightNumber(raw.flightNumber);
  const departure = time(raw.departure);
  const arrival = time(raw.arrival);
  const aircraft = text(raw.aircraft);
  const sourceUrl = text(raw.sourceUrl);
  const validatedAt = date(raw.validatedAt);

  if (!/^(?:LHR|LGW|LCY)$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    throw new Error("The departure hub must be LHR, LGW or LCY and the destination must be a three-letter IATA code.");
  }
  if (!flightNumber) throw new Error(virtualTimetable ? "Use a BAV virtual service reference in the format BAV1001." : "Use a real BA flight number in the format BA123.");
  if (!departure || !arrival || !aircraft) {
    throw new Error("Local departure time, arrival time and scheduled aircraft are required.");
  }
  if (!/^https:\/\//.test(sourceUrl) || !validatedAt) {
    throw new Error("A public timetable source URL and the date it was verified are required.");
  }

  const id = existingId || text(raw.id) || `${flightNumber}-${from}-${to}`.toLowerCase();
  const suppliedCallsign = text(raw.callsign);
  const verifiedCallsign = suppliedCallsign ? callsign(suppliedCallsign) : undefined;
  if (suppliedCallsign && !verifiedCallsign) {
    throw new Error("Use a BAW callsign in the format BAW267.");
  }
  return {
    id,
    from,
    to,
    flightNumber,
    callsign: verifiedCallsign ?? `BAW${flightNumber.replace(/^(?:BAV|BA)/i, "")}`,
    departure,
    arrival,
    duration: text(raw.duration, "2h 00m"),
    aircraft,
    slots: Math.max(0, Math.round(numberValue(raw.slots, 10))),
    active: bool(raw.active, true),
    validFrom: date(raw.validFrom),
    validUntil: date(raw.validUntil),
    operatingDays: operatingDays(raw.operatingDays),
    aircraftOptions: aircraftList(raw.aircraftOptions),
    sourceUrl,
    validatedAt,
    scheduleScoringEnabled: bool(raw.scheduleScoringEnabled, false),
    catalogueOnly: false,
    virtualTimetable,
  };
}

function parseCsv(textValue: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < textValue.length; index += 1) {
    const character = textValue[index];
    if (quoted) {
      if (character === '"' && textValue[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell.trim()); cell = ""; }
    else if (character === "\n") { row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else if (character !== "\r") cell += character;
  }
  if (quoted) throw new Error("The timetable CSV has an unclosed quoted value.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function canonicalHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function csvValue(row: string[], headers: Map<string, number>, ...names: string[]) {
  for (const name of names) {
    const index = headers.get(canonicalHeader(name));
    if (index !== undefined) return row[index] ?? "";
  }
  return "";
}

function csvBoolean(value: string, fallback: boolean) {
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return fallback;
}

function csvList(value: string) {
  return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function timetableKey(route: Pick<ManagedRoute, "from" | "to" | "flightNumber" | "departure" | "validFrom" | "validUntil">) {
  return [route.from, route.to, route.flightNumber, route.departure, route.validFrom ?? "", route.validUntil ?? ""].join("|");
}

function importRouteId(route: ManagedRoute, usedIds: Set<string>) {
  const stem = `ba-import-${route.from.toLowerCase()}-${route.to.toLowerCase()}-${route.flightNumber.toLowerCase()}-${route.departure.replace(":", "")}`;
  let id = stem;
  let suffix = 2;
  while (usedIds.has(id)) { id = `${stem}-${suffix}`; suffix += 1; }
  usedIds.add(id);
  return id;
}

function parseTimetableImport(csv: string) {
  if (csv.length > 750_000) throw new Error("The timetable import is too large. Split it into smaller files.");
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error("Paste a CSV header and at least one timetable row.");
  const headers = new Map(rows[0].map((header, index) => [canonicalHeader(header), index]));
  const required = ["flightNumber", "callsign", "from", "to", "departure", "arrival", "duration", "aircraft", "sourceUrl", "validatedAt"];
  const missing = required.filter((header) => !headers.has(canonicalHeader(header)));
  if (missing.length) throw new Error(`The timetable CSV is missing: ${missing.join(", ")}.`);

  const keys = new Set<string>();
  return rows.slice(1).map((row, rowIndex) => {
    try {
      const realCallsign = csvValue(row, headers, "callsign");
      if (!callsign(realCallsign)) throw new Error("Callsign must be a verified BAW identifier, for example BAW267.");
      const route = normalizeRoute({
        from: csvValue(row, headers, "from"),
        to: csvValue(row, headers, "to"),
        flightNumber: csvValue(row, headers, "flightNumber"),
        callsign: realCallsign,
        departure: csvValue(row, headers, "departure"),
        arrival: csvValue(row, headers, "arrival"),
        duration: csvValue(row, headers, "duration"),
        aircraft: csvValue(row, headers, "aircraft"),
        aircraftOptions: csvList(csvValue(row, headers, "aircraftOptions")),
        slots: csvValue(row, headers, "slots") || 12,
        active: csvBoolean(csvValue(row, headers, "active"), true),
        validFrom: csvValue(row, headers, "validFrom"),
        validUntil: csvValue(row, headers, "validUntil"),
        operatingDays: csvList(csvValue(row, headers, "operatingDays")).map(Number),
        sourceUrl: csvValue(row, headers, "sourceUrl"),
        validatedAt: csvValue(row, headers, "validatedAt"),
        scheduleScoringEnabled: csvBoolean(csvValue(row, headers, "scheduleScoringEnabled"), false),
      });
      const key = timetableKey(route);
      if (keys.has(key)) throw new Error("Duplicate service in this import.");
      keys.add(key);
      return route;
    } catch (error) {
      throw new Error(`CSV row ${rowIndex + 2}: ${error instanceof Error ? error.message : "Invalid service."}`);
    }
  });
}

async function authorize(permission: PermissionId) {
  const session = await getStaffSession();
  if (!session) return { denied: NextResponse.json({ error: "Staff authentication required." }, { status: 401 }) };
  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!actor || !hasPermission(state, actor, permission)) {
    return { denied: NextResponse.json({ error: `Permission required: ${permission}.` }, { status: 403 }) };
  }
  return { session, state, actor };
}

export async function GET() {
  const auth = await authorize("routes.view");
  if ("denied" in auth) return auth.denied;
  return NextResponse.json({ routes: await getManagedRoutes() });
}

export async function POST(request: NextRequest) {
  const auth = await authorize("routes.create");
  if ("denied" in auth) return auth.denied;
  try {
    const body = (await request.json()) as { route?: unknown; timetableCsv?: unknown };
    if (typeof body.timetableCsv === "string") {
      if (!hasPermission(auth.state, auth.actor, "routes.edit")) {
        return NextResponse.json({ error: "Permission required: routes.edit." }, { status: 403 });
      }
      const imported = parseTimetableImport(body.timetableCsv);
      const routes = await getManagedRoutes();
      const usedIds = new Set(routes.map((route) => route.id));
      const existingByKey = new Map(routes.filter((route) => !route.catalogueOnly).map((route) => [timetableKey(route), route]));
      let created = 0;
      let updated = 0;
      const next = [...routes];
      for (const incoming of imported) {
        const existing = existingByKey.get(timetableKey(incoming));
        if (existing) {
          const index = next.findIndex((route) => route.id === existing.id);
          next[index] = { ...incoming, id: existing.id, catalogueOnly: false };
          updated += 1;
        } else {
          const route = { ...incoming, id: importRouteId(incoming, usedIds), catalogueOnly: false };
          next.push(route);
          existingByKey.set(timetableKey(route), route);
          created += 1;
        }
      }
      await saveManagedRoutes(next);
      const auditState = await getStaffState();
      addAudit(auditState, { actorEmail: auth.actor.email, actorName: auth.actor.name, action: "route.timetable_imported", details: `Imported ${imported.length} verified BA service record${imported.length === 1 ? "" : "s"} (${created} created, ${updated} updated).` });
      await saveStaffState(auditState);
      return NextResponse.json({ routes: await getManagedRoutes(), created, updated });
    }
    const route = normalizeRoute(body.route);
    const created = await createManagedRoute(route);
    const auditState = await getStaffState();
    addAudit(auditState, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "route.created",
      details: `Created route ${created.flightNumber} ${created.from}–${created.to}.`,
    });
    await saveStaffState(auditState);
    return NextResponse.json({ route: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create route." }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await authorize("routes.edit");
  if ("denied" in auth) return auth.denied;
  try {
    const body = (await request.json()) as { id?: string; route?: unknown };
    const id = text(body.id);
    if (!id) throw new Error("Route id is required.");
    const route = normalizeRoute(body.route, id);
    const updated = await updateManagedRoute(id, route);
    const auditState = await getStaffState();
    addAudit(auditState, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "route.updated",
      details: `Updated route ${updated.flightNumber} ${updated.from}–${updated.to}.`,
    });
    await saveStaffState(auditState);
    return NextResponse.json({ route: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update route." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize("routes.delete");
  if ("denied" in auth) return auth.denied;
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) throw new Error("Route id is required.");
    const existing = (await getManagedRoutes()).find((route) => route.id === id);
    await deleteManagedRoute(id);
    const auditState = await getStaffState();
    addAudit(auditState, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "route.deleted",
      details: `Deleted route ${existing ? `${existing.flightNumber} ${existing.from}–${existing.to}` : id}.`,
    });
    await saveStaffState(auditState);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete route." }, { status: 400 });
  }
}
