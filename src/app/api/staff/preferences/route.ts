import { NextRequest, NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-auth";
import { getStaffPreferences, setStaffPageBackground } from "@/lib/staff-preferences";

const MAX_BACKGROUND_LENGTH = 22_000_000;
const BACKGROUND_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const session = await getStaffSession();
  if (!session) return jsonError("Staff authentication required.", 401);

  const preferences = await getStaffPreferences(session.userId);
  return NextResponse.json({ background: preferences.staffPageBackground ?? null });
}

export async function PUT(request: NextRequest) {
  const session = await getStaffSession();
  if (!session) return jsonError("Staff authentication required.", 401);

  const body = (await request.json().catch(() => null)) as { background?: unknown } | null;
  const background = body?.background;

  if (background !== null && typeof background !== "string") {
    return jsonError("Background must be an image or null.");
  }

  if (typeof background === "string") {
    if (!background || background.length > MAX_BACKGROUND_LENGTH || !BACKGROUND_PATTERN.test(background)) {
      return jsonError("Please use a JPG, PNG or WebP image under 15 MB for the staff background.");
    }
  }

  const preferences = await setStaffPageBackground(session.userId, typeof background === "string" ? background : null);
  return NextResponse.json({ background: preferences.staffPageBackground ?? null });
}
