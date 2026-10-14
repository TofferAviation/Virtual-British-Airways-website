import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { requirePilotSession } from "@/lib/pilot-auth";
import { listVoiceRooms } from "@/lib/voice-room-store";
import { CrewLounge } from "./CrewLounge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crew Lounge",
  description: "Plan flights and meet fellow British Airways Virtual pilots.",
};

export default async function CrewLoungePage() {
  const [pilot, rooms] = await Promise.all([requirePilotSession(), listVoiceRooms()]);
  return (
    <>
      <SiteHeader />
      <CrewLounge
        pilot={{ id: pilot.pilotId, name: pilot.name, pilotNumber: pilot.pilotNumber, profileImage: pilot.profileImage ?? null }}
        initialRooms={rooms.map((room) => ({
          id: room.id,
          name: room.name,
          description: room.description,
          startsAt: room.startsAt,
          endsAt: room.endsAt,
          status: room.status,
        }))}
      />
      <SiteFooter />
    </>
  );
}
