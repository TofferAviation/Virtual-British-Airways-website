import { NextResponse } from "next/server";
import { requireStaffPermission } from "@/lib/staff-auth";
import { setPilotStatus, updatePilotAdminFields } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json() as { status?: "active" | "suspended"; rank?: string; hub?: string; tier?: string };
    const { id } = await context.params;

    if (body.status) {
      await requireStaffPermission("users.suspend");
      const pilot = await setPilotStatus(id, body.status);
      return NextResponse.json({ ok: true, pilot });
    }

    await requireStaffPermission("users.edit");
    const pilot = await updatePilotAdminFields(id, { rank: body.rank, hub: body.hub, tier: body.tier });
    return NextResponse.json({ ok: true, pilot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update pilot.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
