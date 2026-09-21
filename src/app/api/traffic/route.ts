import { NextRequest, NextResponse } from "next/server";
import { recordSiteTraffic } from "@/lib/site-traffic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
  try {
    const body = await request.json() as { path?: unknown; visit?: unknown };
    await recordSiteTraffic(body.path, body.visit === true);
  } catch {
    // Analytics must never interrupt the public website when storage is busy.
  }
  return new NextResponse(null, { status: 204 });
}
