import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { EventsExperience } from "@/components/EventsExperience";
import { eventCategories, type VirtualEvent } from "@/data/events";
import { getEvents } from "@/lib/event-store";
import { getPilotSession } from "@/lib/pilot-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events",
  description: "Community flights, long-haul weekends and special challenges for British Airways Virtual pilots.",
};

function getInitialMonth(events: VirtualEvent[]) {
  const today = new Date().toISOString().slice(0, 10);
  const nextEvent = events
    .filter((event) => event.published && event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  if (nextEvent) return nextEvent.date.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

export default async function EventsPage() {
  const isLoggedIn = Boolean(await getPilotSession());
  const allEvents = await getEvents();
  const publishedEvents = allEvents.filter((event) => event.published);

  return (
    <div className="events-layout">
      <SiteHeader />
      <EventsExperience
        events={publishedEvents}
        categories={eventCategories}
        initialMonth={getInitialMonth(publishedEvents)}
        isLoggedIn={isLoggedIn}
      />
      <SiteFooter />
    </div>
  );
}
