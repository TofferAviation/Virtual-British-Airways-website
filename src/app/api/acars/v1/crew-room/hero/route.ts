import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { CrewRoomExperienceError, readFeaturedCrewRoomEventHero } from "@/lib/crew-room-store";

function errorResponse(error: unknown) {
  if (error instanceof CrewRoomExperienceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Crew Lounge event hero is unavailable." },
    { status: 503 },
  );
}

/** Streams only the current featured event's private, staff-approved Ember hero. */
export async function GET(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const hero = await readFeaturedCrewRoomEventHero();
    if (!hero) return NextResponse.json({ error: "No featured event hero is available." }, { status: 404 });
    return new NextResponse(Buffer.from(hero.bytes), {
      headers: {
        "Content-Type": hero.contentType,
        "Cache-Control": "private, no-store",
        "Vary": "Authorization",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
