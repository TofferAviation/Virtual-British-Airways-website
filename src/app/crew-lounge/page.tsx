import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { type VirtualEvent } from "@/data/events";
import { getEvents } from "@/lib/event-store";
import { requirePilotSession } from "@/lib/pilot-auth";
import { staffHasPermission } from "@/lib/staff-auth";
import { listVoiceRooms } from "@/lib/voice-room-store";
import { CrewLoungeExperience } from "./CrewLoungeExperience";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crew Lounge",
  description: "Plan flights and meet fellow British Airways Virtual pilots.",
};

function upcomingEvents(events: VirtualEvent[]) {
  const today = new Date().toISOString().slice(0, 10);
  return events
    .filter((event) => event.published && event.date >= today)
    .sort((left, right) => `${left.date}T${left.startUtc}`.localeCompare(`${right.date}T${right.startUtc}`))
    .slice(0, 2)
    .map((event) => ({
      id: event.id,
      title: event.title,
      typeLabel: event.typeLabel,
      date: event.date,
      startUtc: event.startUtc,
      route: event.route,
      participantCount: event.participantCount,
    }));
}

export default async function CrewLoungePage() {
  const [pilot, rooms, canManageRooms, events] = await Promise.all([
    requirePilotSession(),
    listVoiceRooms(),
    staffHasPermission("settings.edit"),
    getEvents(),
  ]);
  return (
    <>
      <SiteHeader />
      <CrewLoungeExperience
        pilot={{ id: pilot.pilotId, name: pilot.name, pilotNumber: pilot.pilotNumber, profileImage: pilot.profileImage ?? null }}
        canManageRooms={canManageRooms}
        initialRooms={rooms.map((room) => ({
          id: room.id,
          name: room.name,
          description: room.description,
          startsAt: room.startsAt,
          endsAt: room.endsAt,
          status: room.status,
        }))}
        initialEvents={upcomingEvents(events)}
      />
      <SiteFooter />
    </>
  );
}
