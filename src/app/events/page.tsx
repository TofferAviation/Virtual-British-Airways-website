import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { EventsExperience } from "@/components/EventsExperience";
import { eventCategories, virtualEvents } from "@/data/events";

export const metadata: Metadata = {
  title: "Events",
  description: "Community flights, long-haul weekends and special challenges for British Airways Virtual pilots.",
};

function getInitialMonth() {
  const today = new Date().toISOString().slice(0, 10);
  const nextEvent = virtualEvents
    .filter((event) => event.published && event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  if (nextEvent) return nextEvent.date.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

export default async function EventsPage() {
  const cookieStore = await cookies();
  const isLoggedIn = cookieStore.get("bav_demo_session")?.value === "1";

  return (
    <div className="events-layout">
      <SiteHeader />
      <EventsExperience
        events={virtualEvents}
        categories={eventCategories}
        initialMonth={getInitialMonth()}
        isLoggedIn={isLoggedIn}
      />
      <SiteFooter />
    </div>
  );
}
