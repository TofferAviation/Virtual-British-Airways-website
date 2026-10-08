import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { updateCrewLinkPresence } from "@/lib/crew-link-store";
import { supportedSimulatorLabels, type SupportedSimulator } from "@/lib/acars-contract";

function simulator(value: unknown): SupportedSimulator | null {
  return typeof value === "string" && value in supportedSimulatorLabels ? value as SupportedSimulator : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { simulator?: unknown; simulatorConnected?: unknown } | null;
  try {
    const session = await updateCrewLinkPresence({
      sessionId: id,
      pilotId: auth.account.id,
      simulator: simulator(body?.simulator),
      simulatorConnected: body?.simulatorConnected === true,
    });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CrewLink presence could not be updated." }, { status: 409 });
  }
}
