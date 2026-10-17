import { NextRequest, NextResponse } from "next/server";
import { getPilotSession } from "@/lib/pilot-auth";
import { getActivePilotBooking } from "@/lib/pilot-operations-store";
import { getPilotById } from "@/lib/pilot-store";
import { CrewRoomRequestError, createCrewRoomRequest, listPilotCrewRoomRequests } from "@/lib/crew-room-request-store";

export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function errorResponse(error: unknown) {
  if (error instanceof CrewRoomRequestError) return response({ error: error.message }, error.status);
  return response({ error: error instanceof Error ? error.message : "Crew-room requests are temporarily unavailable." }, 503);
}

async function authenticatedPilot() {
  const session = await getPilotSession();
  if (!session) return null;
  const pilot = await getPilotById(session.pilotId);
  if (!pilot) return null;
  return { session, pilot };
}

export async function GET() {
  const auth = await authenticatedPilot();
  if (!auth) return response({ error: "Pilot sign-in required." }, 401);
  try {
    return response({ requests: await listPilotCrewRoomRequests(auth.session.pilotId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticatedPilot();
  if (!auth) return response({ error: "Pilot sign-in required." }, 401);
  try {
    const booking = await getActivePilotBooking(auth.session.pilotId);
    if (!booking) throw new CrewRoomRequestError("Choose and save a BAV flight before requesting its crew room.", 409);
    const form = await request.formData();
    const file = form.get("banner");
    const bannerUpload = file instanceof File && file.size
      ? { contentType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }
      : null;
    const mediaPreferences = (() => {
      const raw = form.get("mediaPreferences");
      if (typeof raw !== "string") return ["voice"];
      try { return JSON.parse(raw); } catch { return ["voice"]; }
    })();
    const crewRoomRequest = await createCrewRoomRequest({
      pilotId: auth.session.pilotId,
      pilotNumber: auth.session.pilotNumber,
      pilotName: auth.session.name,
      pilotRank: auth.pilot.rank,
      booking,
      roomName: form.get("roomName"),
      welcomeNote: form.get("welcomeNote"),
      requestedCapacity: form.get("requestedCapacity"),
      mediaPreferences,
      bannerId: form.get("bannerId"),
      bannerUpload,
    });
    return response({ request: crewRoomRequest }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
