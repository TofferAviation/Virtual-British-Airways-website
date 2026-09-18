import { NextResponse } from "next/server";
import { requireStaffPermission } from "@/lib/staff-auth";
import { getRewardSettings, updateRewardSettings } from "@/lib/pilot-store";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireStaffPermission("settings.edit");
  return NextResponse.json({ settings: await getRewardSettings() });
}

export async function PUT(request: Request) {
  await requireStaffPermission("settings.edit");
  try {
    const settings = await updateRewardSettings(await request.json());
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save reward settings." }, { status: 400 });
  }
}
