import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff-auth";
import { listLiveAcarsSessions } from "@/lib/acars-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(
    { sessions: await listLiveAcarsSessions() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
