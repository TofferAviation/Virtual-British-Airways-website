import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { requireStaffPermission } from "@/lib/staff-auth";
import { getRewardSettings } from "@/lib/pilot-store";
import { RewardSettingsClient } from "./RewardSettingsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reward Settings" };

export default async function RewardSettingsPage() {
  await requireStaffPermission("settings.edit");
  return <><SiteHeader /><RewardSettingsClient initialSettings={await getRewardSettings()} /><SiteFooter /></>;
}
