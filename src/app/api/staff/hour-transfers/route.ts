import { NextResponse } from "next/server";
import { requireStaffPermission } from "@/lib/staff-auth";
import { reviewPilotHourTransferRequest } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const session = await requireStaffPermission("users.edit");
    const body = await request.json() as {
      requestId?: unknown;
      decision?: unknown;
      creditedHours?: unknown;
      reviewNote?: unknown;
    };
    const result = await reviewPilotHourTransferRequest({ ...body, reviewedBy: session.name });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to review transfer-credit request.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
