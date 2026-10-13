import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getCrewRoomExperience } from "@/lib/crew-room-store";
import { requireStaffPermission } from "@/lib/staff-auth";
import { CrewLoungeControl } from "./CrewLoungeControl";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Crew Lounge host desk" };

export default async function CrewLoungeSettingsPage() {
  await requireStaffPermission("settings.edit");
  const experience = await getCrewRoomExperience();
  return <><SiteHeader /><CrewLoungeControl initialSettings={experience.settings} initialEvents={experience.events} initialHero={experience.featuredHero} /><SiteFooter /></>;
}
