import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { getActiveAcarsSessionForPilot } from "@/lib/acars-store";

export async function GET(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getActiveAcarsSessionForPilot(auth.account.id);
  return NextResponse.json({ session });
}
