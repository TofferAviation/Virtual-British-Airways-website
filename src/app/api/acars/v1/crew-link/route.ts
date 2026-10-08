import { NextResponse } from "next/server";
import { requireAcarsBearer } from "@/lib/acars-auth";
import { createCrewLinkSession, getCrewLinkSessionForPilot } from "@/lib/crew-link-store";
import { getActivePilotBooking } from "@/lib/pilot-operations-store";
import { supportedSimulatorLabels, type SupportedSimulator } from "@/lib/acars-contract";

function simulator(value: unknown): SupportedSimulator | null {
  return typeof value === "string" && value in supportedSimulatorLabels ? value as SupportedSimulator : null;
}

export async function GET(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ session: await getCrewLinkSessionForPilot(auth.account.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CrewLink is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAcarsBearer(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { simulator?: unknown } | null;
  const booking = await getActivePilotBooking(auth.account.id);
  if (!booking) return NextResponse.json({ error: "Choose an active BAV flight before opening a CrewLink session." }, { status: 409 });
  try {
    const session = await createCrewLinkSession({
      pilotId: auth.account.id,
      pilotNumber: auth.account.pilotNumber,
      pilotName: auth.account.name,
      bookingId: booking.id,
      flightNumber: booking.flightNumber,
      from: booking.from,
      to: booking.to,
      aircraft: booking.aircraft,
      simulator: simulator(body?.simulator),
    });
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CrewLink could not be opened." }, { status: 503 });
  }
}
