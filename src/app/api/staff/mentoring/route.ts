import { NextRequest, NextResponse } from "next/server";
import { addMentoringProgressNote, createMentoringMatch, endMentoringMatch } from "@/lib/pilot-store";
import { requireStaffPermission } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireStaffPermission("users.edit");
    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "create") {
      const match = await createMentoringMatch({ mentorPilotId: String(body.mentorPilotId ?? ""), learnerPilotId: String(body.learnerPilotId ?? ""), goal: String(body.goal ?? ""), staffName: session.name });
      return NextResponse.json({ ok: true, match });
    }
    if (action === "progress") {
      const progress = await addMentoringProgressNote({ matchId: String(body.matchId ?? ""), note: String(body.note ?? ""), staffName: session.name });
      return NextResponse.json({ ok: true, progress });
    }
    if (action === "end" && (body.status === "completed" || body.status === "cancelled")) {
      const match = await endMentoringMatch({ matchId: String(body.matchId ?? ""), status: body.status, staffName: session.name });
      return NextResponse.json({ ok: true, match });
    }
    return NextResponse.json({ ok: false, error: "Choose a valid mentoring action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update mentoring." }, { status: 400 });
  }
}
