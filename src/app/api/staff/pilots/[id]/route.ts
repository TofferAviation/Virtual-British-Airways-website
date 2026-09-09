import { NextResponse } from "next/server";
import { requireStaffPermission } from "@/lib/staff-auth";
import { isPilotRank } from "@/lib/pilot-ranks";
import { setPilotStatus, updatePilotAdminFields } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json() as { status?: "active" | "suspended"; rankOverride?: string | null; hub?: string; tier?: string };
    const { id } = await context.params;

    if (body.status) {
      await requireStaffPermission("users.suspend");
      const pilot = await setPilotStatus(id, body.status);
      return NextResponse.json({ ok: true, pilot });
    }

    await requireStaffPermission("users.edit");
    let rankOverride = undefined as Parameters<typeof updatePilotAdminFields>[1]["rankOverride"] | undefined;
    if (body.rankOverride === null || body.rankOverride === "automatic") rankOverride = null;
    else if (body.rankOverride !== undefined) {
      if (!isPilotRank(body.rankOverride)) throw new Error("Invalid pilot rank.");
      rankOverride = body.rankOverride;
    }

    const pilot = await updatePilotAdminFields(id, { rankOverride, hub: body.hub, tier: body.tier });
    return NextResponse.json({ ok: true, pilot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update pilot.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
