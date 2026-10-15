import { NextResponse } from "next/server";
import {
  CrewRoomExperienceError,
  listCrewRoomIntents,
  removeCrewRoomIntent,
  upsertCrewRoomIntent,
} from "@/lib/crew-room-store";
import { getPilotSession } from "@/lib/pilot-auth";
import { getPilotById } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ eventId: string }> };

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function errorResponse(error: unknown) {
  if (error instanceof CrewRoomExperienceError) return response({ error: error.message }, error.status);
  console.error("[flight-companion] Could not update the crew board.", error);
  return response({ error: "The crew board is unavailable right now. Please try again shortly." }, 503);
}

async function eventIdFor(context: Context) {
  const { eventId } = await context.params;
  return eventId;
}

async function pilotForRequest() {
  const pilot = await getPilotSession();
  if (!pilot) return null;
  return pilot;
}

/**
 * The crew board is deliberately separate from an operational booking or
 * official event registration. It only lets authenticated pilots signal that
 * they would like to plan or fly alongside the community.
 */
export async function GET(_: Request, context: Context) {
  const pilot = await pilotForRequest();
  if (!pilot) return response({ error: "Pilot sign-in required." }, 401);
  try {
    return response({ intentions: await listCrewRoomIntents(await eventIdFor(context)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(_: Request, context: Context) {
  const pilot = await pilotForRequest();
  if (!pilot) return response({ error: "Pilot sign-in required." }, 401);
  try {
    const eventId = await eventIdFor(context);
    const account = await getPilotById(pilot.pilotId);
    await upsertCrewRoomIntent({
      eventId,
      pilotId: pilot.pilotId,
      pilotNumber: pilot.pilotNumber,
      pilotName: pilot.name,
      pilotRank: account?.rank ?? null,
      flightNumber: null,
      route: null,
      aircraft: null,
    });
    return response({ intentions: await listCrewRoomIntents(eventId) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_: Request, context: Context) {
  const pilot = await pilotForRequest();
  if (!pilot) return response({ error: "Pilot sign-in required." }, 401);
  try {
    const eventId = await eventIdFor(context);
    await removeCrewRoomIntent(eventId, pilot.pilotId);
    return response({ intentions: await listCrewRoomIntents(eventId) });
  } catch (error) {
    return errorResponse(error);
  }
}
