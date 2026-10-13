import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-auth";
import { addAudit, getStaffState, hasPermission, saveStaffState } from "@/lib/staff-store";
import {
  CrewRoomExperienceError,
  deleteCrewRoomEventHero,
  readCrewRoomEventHero,
  uploadCrewRoomEventHero,
} from "@/lib/crew-room-store";

async function authorize() {
  const session = await getStaffSession();
  if (!session) return { denied: NextResponse.json({ error: "Staff authentication required." }, { status: 401 }) };
  const state = await getStaffState();
  const actor = state.users.find((user) => user.id === session.userId && user.status === "active");
  if (!actor || !hasPermission(state, actor, "settings.edit")) {
    return { denied: NextResponse.json({ error: "Permission required: settings.edit." }, { status: 403 }) };
  }
  return { state, actor };
}

function errorResponse(error: unknown) {
  if (error instanceof CrewRoomExperienceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "The Ember event hero is unavailable." },
    { status: 503 },
  );
}

function imageResponse(hero: { bytes: Uint8Array; contentType: string }) {
  return new NextResponse(Buffer.from(hero.bytes), {
    headers: {
      "Content-Type": hero.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  const auth = await authorize();
  if ("denied" in auth) return auth.denied;
  try {
    const hero = await readCrewRoomEventHero(request.nextUrl.searchParams.get("eventId"));
    if (!hero) return NextResponse.json({ error: "No Ember event hero has been selected." }, { status: 404 });
    return imageResponse(hero);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorize();
  if ("denied" in auth) return auth.denied;

  try {
    const form = await request.formData();
    const upload = form.get("file");
    if (!(upload instanceof File)) throw new CrewRoomExperienceError("Choose a JPG or PNG image for the Ember event hero.", 400);
    const eventId = form.get("eventId");
    const hero = await uploadCrewRoomEventHero({
      eventId,
      contentType: upload.type,
      bytes: new Uint8Array(await upload.arrayBuffer()),
    });
    addAudit(auth.state, {
      actorEmail: auth.actor.email,
      actorName: auth.actor.name,
      action: "crew-room.event-hero.uploaded",
      details: "Uploaded the community-selected Ember hero for event " + hero.eventId + ".",
    });
    await saveStaffState(auth.state);
    return NextResponse.json({ hero }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authorize();
  if ("denied" in auth) return auth.denied;

  const body = await request.json().catch(() => null) as { eventId?: unknown } | null;
  try {
    const removed = await deleteCrewRoomEventHero(body?.eventId);
    if (removed) {
      addAudit(auth.state, {
        actorEmail: auth.actor.email,
        actorName: auth.actor.name,
        action: "crew-room.event-hero.removed",
        details: "Removed the community-selected Ember hero for event " + removed.eventId + ".",
      });
      await saveStaffState(auth.state);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
