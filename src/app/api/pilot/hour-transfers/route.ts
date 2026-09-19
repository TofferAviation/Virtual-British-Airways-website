import { NextResponse } from "next/server";
import { requirePilotSession } from "@/lib/pilot-auth";
import { createPilotHourTransferRequest, listPilotHourTransferRequests } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requirePilotSession();
    const requests = await listPilotHourTransferRequests(session.pilotId);
    return NextResponse.json({ ok: true, requests });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load transfer-credit requests.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePilotSession();
    const body = await request.json() as {
      formerVaName?: unknown;
      requestedHours?: unknown;
      evidenceReference?: unknown;
      pilotNote?: unknown;
    };
    const transferRequest = await createPilotHourTransferRequest(session.pilotId, body);
    return NextResponse.json({ ok: true, request: transferRequest }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit transfer-credit request.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
