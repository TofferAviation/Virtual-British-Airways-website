import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getEvents } from "@/lib/event-store";
import { requireStaffPermission } from "@/lib/staff-auth";
import { listVoiceRooms } from "@/lib/voice-room-store";
import { VoiceRoomControl } from "./VoiceRoomControl";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Crew Lounge voice rooms" };

export default async function VoiceRoomsPage() {
  await requireStaffPermission("settings.edit");
  const [rooms, events] = await Promise.all([listVoiceRooms({ includeClosed: true }), getEvents()]);
  const publishedEvents = events.filter((event) => event.published).map((event) => ({
    id: event.id,
    title: event.title,
    date: event.date,
    startUtc: event.startUtc,
    route: `${event.route.from} → ${event.route.to}`,
  }));
  return <><SiteHeader /><VoiceRoomControl initialRooms={rooms} publishedEvents={publishedEvents} /><SiteFooter /></>;
}
