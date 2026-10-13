import { NextRequest, NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import {
  CrewRoomExperienceError,
  listCrewRoomIntents,
  removeCrewRoomIntent,
  upsertCrewRoomIntent,
} from "@/lib/crew-room-store";

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof CrewRoomExperienceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 503 });
}

/** Voluntary planning notes only — these never create a BAV booking, roster or registration. */
export async function GET(request: NextRequest) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "Choose a BAV event first." }, { status: 400 });
  try {
    return NextResponse.json({ intentions: await listCrewRoomIntents(eventId) });
  } catch (error) {
    return errorResponse(error, "The planning board is unavailable.");
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    const intention = await upsertCrewRoomIntent({
      eventId: body?.eventId,
      pilotId: auth.account.id,
      pilotNumber: auth.account.pilotNumber,
      pilotName: auth.account.name,
      pilotRank: auth.account.rank,
      flightNumber: body?.flightNumber,
      route: body?.route,
      aircraft: body?.aircraft,
    });
    return NextResponse.json({ intention }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "The planning board could not be updated.");
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const eventId = request.nextUrl.searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "Choose a BAV event first." }, { status: 400 });
  try {
    await removeCrewRoomIntent(eventId, auth.account.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "The planning board could not be updated.");
  }
}
