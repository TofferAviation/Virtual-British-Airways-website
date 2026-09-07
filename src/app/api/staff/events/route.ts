import { NextRequest, NextResponse } from "next/server";
import type { EventCategoryId, VirtualEvent } from "@/data/events";
import { createEvent, deleteEvent, getEvents, slugifyEventTitle, updateEvent } from "@/lib/event-store";
import { getStaffSession } from "@/lib/staff-auth";

const categories: EventCategoryId[] = ["community", "long-haul", "challenge"];

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

function normalizeEvent(input: unknown, existingId?: string): VirtualEvent {
  if (!input || typeof input !== "object") throw new Error("Invalid event payload.");
  const raw = input as Record<string, unknown>;
  const route = (raw.route && typeof raw.route === "object" ? raw.route : {}) as Record<string, unknown>;
  const rewards = (raw.rewards && typeof raw.rewards === "object" ? raw.rewards : {}) as Record<string, unknown>;
  const category = categories.includes(raw.category as EventCategoryId) ? (raw.category as EventCategoryId) : "community";
  const title = text(raw.title);
  const date = text(raw.date);
  const startUtc = text(raw.startUtc);
  const endUtc = text(raw.endUtc);
  const from = text(route.from).toUpperCase();
  const to = text(route.to).toUpperCase();

  if (!title || !date || !startUtc || !endUtc || !from || !to) {
    throw new Error("Title, date, times and route are required.");
  }

  const id = existingId || text(raw.id) || `evt-${slugifyEventTitle(title)}-${date}`;
  const destinations = Array.isArray(raw.featuredDestinations)
    ? raw.featuredDestinations.map((item) => text(item).toUpperCase()).filter(Boolean)
    : [];

  return {
    id,
    slug: text(raw.slug) || slugifyEventTitle(title),
    title,
    typeLabel: text(raw.typeLabel, category === "long-haul" ? "Long-haul Event" : category === "challenge" ? "Special Challenge" : "Community Flight"),
    category,
    summary: text(raw.summary),
    description: text(raw.description),
    date,
    startUtc,
    endUtc,
    route: {
      from,
      to,
      fromName: text(route.fromName, from),
      toName: text(route.toName, to),
    },
    image: text(raw.image, "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1800&q=88"),
    imagePosition: text(raw.imagePosition) || undefined,
    featured: bool(raw.featured),
    published: bool(raw.published),
    registrationOpen: bool(raw.registrationOpen, true),
    participantCount: Math.max(0, Math.round(numberValue(raw.participantCount))),
    featuredDestinations: destinations.length ? destinations : [from, to],
    aircraftNote: text(raw.aircraftNote, "All aircraft welcome"),
    rewards: {
      vaPoints: Math.max(0, Math.round(numberValue(rewards.vaPoints))),
      tierPoints: Math.max(0, Math.round(numberValue(rewards.tierPoints))),
      badge: text(rewards.badge) || undefined,
    },
  };
}

async function authorize() {
  const session = await getStaffSession();
  return session ? null : NextResponse.json({ error: "Staff authentication required." }, { status: 401 });
}

export async function GET() {
  const denied = await authorize();
  if (denied) return denied;
  return NextResponse.json({ events: await getEvents() });
}

export async function POST(request: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  try {
    const body = (await request.json()) as { event?: unknown };
    const event = normalizeEvent(body.event);
    return NextResponse.json({ event: await createEvent(event) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create event." }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  try {
    const body = (await request.json()) as { id?: string; event?: unknown };
    const id = text(body.id);
    if (!id) throw new Error("Event id is required.");
    const event = normalizeEvent(body.event, id);
    return NextResponse.json({ event: await updateEvent(id, event) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update event." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (!id) throw new Error("Event id is required.");
    await deleteEvent(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete event." }, { status: 400 });
  }
}
