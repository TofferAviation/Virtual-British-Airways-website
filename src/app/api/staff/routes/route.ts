import { NextRequest, NextResponse } from "next/server";
import {
  createManagedRoute,
  deleteManagedRoute,
  getManagedRoutes,
  updateManagedRoute,
  type ManagedRoute,
} from "@/lib/route-store";
import { getStaffSession } from "@/lib/staff-auth";

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

async function authorize() {
  const session = await getStaffSession();
  return session ? null : NextResponse.json({ error: "Staff authentication required." }, { status: 401 });
}

export async function GET() {
  const denied = await authorize();
  if (denied) return denied;
  return NextResponse.json({ routes: await getManagedRoutes() });
}

export async function POST(request: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  try {
    const body = (await request.json()) as { route?: unknown };
    const route = normalizeRoute(body.route);
    return NextResponse.json({ route: await createManagedRoute(route) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create route." }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  try {
    const body = (await request.json()) as { id?: string; route?: unknown };
    const id = text(body.id);
    if (!id) throw new Error("Route id is required.");
    const route = normalizeRoute(body.route, id);
    return NextResponse.json({ route: await updateManagedRoute(id, route) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update route." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) throw new Error("Route id is required.");
    await deleteManagedRoute(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete route." }, { status: 400 });
  }
}
