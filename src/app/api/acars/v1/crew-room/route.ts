import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { CrewRoomExperienceError, getCrewRoomExperience } from "@/lib/crew-room-store";

function errorResponse(error: unknown) {
  if (error instanceof CrewRoomExperienceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Crew Lounge is unavailable." },
    { status: 503 },
  );
}

/** Calendar-backed Crew Lounge configuration for authenticated Ember pilots. */
export async function GET(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await getCrewRoomExperience());
  } catch (error) {
    return errorResponse(error);
  }
}
