import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";

/** Returns the latest account identity for Cabin Control without exposing any credentials. */
export async function GET(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, pilotNumber, name, email, profileImage } = auth.account;
  return NextResponse.json({ pilot: { id, pilotNumber, name, email, profileImage } });
}
