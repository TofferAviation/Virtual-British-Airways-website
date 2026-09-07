import { NextRequest, NextResponse } from "next/server";
import {
  createManagedRoute,
  deleteManagedRoute,
  getManagedRoutes,
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

function normalizeRoute(input: unknown, existingId?: string): ManagedRoute {
  if (!input || typeof input !== "object") throw new Error("Invalid route payload.");
  const raw = input as Record<string, unknown>;
  const from = text(raw.from).toUpperCase();
  const to = text(raw.to).toUpperCase();
  const flightNumber = text(raw.flightNumber).toUpperCase();
  const departure = text(raw.departure);
  const arrival = text(raw.arrival);
  const aircraft = text(raw.aircraft);

  if (!from || !to || !flightNumber || !departure || !arrival || !aircraft) {
    throw new Error("From, to, flight number, times and aircraft are required.");
  }

  const id = existingId || text(raw.id) || `${flightNumber}-${from}-${to}`.toLowerCase();
  return {
    id,
    from,
    to,
    flightNumber,
    departure,
    arrival,
    duration: text(raw.duration, "2h 00m"),
    aircraft,
    slots: Math.max(0, Math.round(numberValue(raw.slots, 10))),
    active: bool(raw.active, true),
  };
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
    const body = (await request.json()) as { route?: unknown };
    const route = normalizeRoute(body.route);
    const created = await createManagedRoute(route);
    addAudit(auth.state, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "route.created",
      details: `Created route ${created.flightNumber} ${created.from}–${created.to}.`,
    });
    await saveStaffState(auth.state);
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
    addAudit(auth.state, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "route.updated",
      details: `Updated route ${updated.flightNumber} ${updated.from}–${updated.to}.`,
    });
    await saveStaffState(auth.state);
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
    addAudit(auth.state, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "route.deleted",
      details: `Deleted route ${existing ? `${existing.flightNumber} ${existing.from}–${existing.to}` : id}.`,
    });
    await saveStaffState(auth.state);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete route." }, { status: 400 });
  }
}
