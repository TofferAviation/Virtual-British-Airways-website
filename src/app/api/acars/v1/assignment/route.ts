import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { getActivePilotBooking } from "@/lib/pilot-operations-store";

export async function GET(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const assignment = await getActivePilotBooking(auth.account.id);
  return NextResponse.json({ assignment });
}
