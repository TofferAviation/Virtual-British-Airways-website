"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { updateCareerEconomySettings } from "@/lib/pilot-career";
import { requireStaffPermission } from "@/lib/staff-auth";

export async function saveCareerEconomyAction(formData: FormData) {
  const staff = await requireStaffPermission("settings.edit");
  const rankHourlyRates = Object.fromEntries(["Cadet", "Second Officer", "First Officer", "Senior First Officer", "Captain", "Senior Captain", "Training Captain"].map((rank) => [rank, formData.get(`rank-${rank}`)]));
  const aircraftMultipliers = Object.fromEntries(["E190", "A320_FAMILY", "A320_NEO", "B777", "B787", "A350", "A380"].map((family) => [family, formData.get(`fleet-${family}`)]));
  try {
    await updateCareerEconomySettings({ label: "British Airways Virtual economy values", rankHourlyRates, aircraftMultipliers, sectorAllowance: formData.get("sectorAllowance"), longHaulAllowance: formData.get("longHaulAllowance"), commandBonus: formData.get("commandBonus"), instructorBonus: formData.get("instructorBonus"), longHaulThresholdMinutes: formData.get("longHaulThresholdMinutes") }, staff.name);
  } catch {
    redirect("/staff/economy?error=save");
  }
  revalidatePath("/staff/economy");
  revalidatePath("/account/career");
  revalidatePath("/account/finances");
  redirect("/staff/economy?saved=1");
}
