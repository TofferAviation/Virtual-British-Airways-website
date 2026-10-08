import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { joinCrewLinkSession } from "@/lib/crew-link-store";
import { supportedSimulatorLabels, type SupportedSimulator } from "@/lib/acars-contract";

function simulator(value: unknown): SupportedSimulator | null {
  return typeof value === "string" && value in supportedSimulatorLabels ? value as SupportedSimulator : null;
}

export async function POST(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { inviteCode?: unknown; simulator?: unknown } | null;
  if (typeof body?.inviteCode !== "string" || !body.inviteCode.trim()) return NextResponse.json({ error: "Enter a CrewLink invite code." }, { status: 400 });
  try {
    const session = await joinCrewLinkSession({
      inviteCode: body.inviteCode,
      pilotId: auth.account.id,
      pilotNumber: auth.account.pilotNumber,
      pilotName: auth.account.name,
      simulator: simulator(body.simulator),
    });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CrewLink could not be joined." }, { status: 409 });
  }
}
