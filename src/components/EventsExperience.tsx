"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { EventCategory, EventCategoryId, VirtualEvent } from "@/data/events";

type EventsExperienceProps = {
  events: VirtualEvent[];
  categories: EventCategory[];
  initialMonth: string;
  isLoggedIn: boolean;
};

type IconName = "calendar" | "group" | "plane" | "pin" | "star" | "globe" | "medal" | "coins" | "bars" | "clock";

const storageKey = "bav_demo_event_registrations";
const registrationChangeEvent = "bav:event-registrations-change";

function subscribeToRegistrations(callback: () => void) {
  const handleStorage = () => callback();
  window.addEventListener("storage", handleStorage);
  window.addEventListener(registrationChangeEvent, handleStorage);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(registrationChangeEvent, handleStorage);
  };
}

function getRegistrationSnapshot() {
  return window.localStorage.getItem(storageKey) ?? "[]";
}

function getServerRegistrationSnapshot() {
  return "[]";
}

function parseJoinedSlugs(snapshot: string) {
  try {
    const parsed: unknown = JSON.parse(snapshot);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function EventIcon({ name }: { name: IconName }) {
  if (name === "calendar") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 9h18v16H7zM11 5v7M21 5v7M7 14h18" /><path d="M11 18h3v3h-3zM18 18h3v3h-3z" /></svg>;
  }
  if (name === "group") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="12" cy="11" r="4" /><circle cx="22" cy="12" r="3" /><path d="M5 25c0-5 3-8 7-8s7 3 7 8M18 19c5-1 8 1 9 6" /></svg>;
  }
  if (name === "pin") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 28s8-7 8-15a8 8 0 1 0-16 0c0 8 8 15 8 15Z" /><circle cx="16" cy="13" r="3" /></svg>;
  }
  if (name === "star") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="m16 4 3.5 7.2 8 .9-5.8 5.5 1.6 7.9L16 21.6l-7.3 3.9 1.6-7.9-5.8-5.5 8-.9L16 4Z" /></svg>;
  }
  if (name === "globe") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" /><path d="M5 16h22M16 5c4 4 6 7 6 11s-2 7-6 11M16 5c-4 4-6 7-6 11s2 7 6 11" /></svg>;
  }
  if (name === "medal") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="12" r="7" /><path d="m12 18-2 10 6-4 6 4-2-10" /></svg>;
  }
  if (name === "coins") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="9" rx="7" ry="3.5" /><path d="M9 9v6c0 2 3 3.5 7 3.5s7-1.5 7-3.5V9M9 15v6c0 2 3 3.5 7 3.5s7-1.5 7-3.5v-6" /></svg>;
  }
  if (name === "bars") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 26V17h5v9H7Zm7 0V11h5v15h-5Zm7 0V6h5v20h-5Z" /></svg>;
  }
  if (name === "clock") {
    return <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" /><path d="M16 9v8l5 3" /></svg>;
  }
  return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 17 27 7l-3 6-7 4-3 10-3 1-1-8-5 3-2 4-2 1 .6-6L0 19l5-2Z" /></svg>;
}

function monthParts(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return { year, month };
}

function moveMonthKey(monthKey: string, delta: number) {
  const { year, month } = monthParts(monthKey);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string) {
  const { year, month } = monthParts(monthKey);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatEventDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function longEventDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

function categoryIcon(icon: EventCategory["icon"]): IconName {
  return icon === "globe" ? "globe" : icon === "star" ? "star" : "plane";
}

export function EventsExperience({ events, categories, initialMonth, isLoggedIn }: EventsExperienceProps) {
  const publishedEvents = useMemo(() => events.filter((event) => event.published).sort((a, b) => a.date.localeCompare(b.date)), [events]);
  const featuredEvent = publishedEvents.find((event) => event.featured) ?? publishedEvents[0];
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);
  const [activeCategory, setActiveCategory] = useState<EventCategoryId | "all">("all");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showMonthList, setShowMonthList] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<VirtualEvent | null>(null);
  const joinedSnapshot = useSyncExternalStore(subscribeToRegistrations, getRegistrationSnapshot, getServerRegistrationSnapshot);
  const joinedSlugs = useMemo(() => parseJoinedSlugs(joinedSnapshot), [joinedSnapshot]);

  useEffect(() => {
    if (!selectedEvent) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedEvent(null);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedEvent]);

  const monthEvents = useMemo(
    () => publishedEvents.filter((event) => event.date.startsWith(visibleMonth)),
    [publishedEvents, visibleMonth],
  );

  const filteredEvents = useMemo(
    () => activeCategory === "all" ? monthEvents : monthEvents.filter((event) => event.category === activeCategory),
    [activeCategory, monthEvents],
  );

  const destinationsFeatured = useMemo(
    () => new Set(monthEvents.flatMap((event) => event.featuredDestinations)).size,
    [monthEvents],
  );
  const communityPilots = useMemo(
    () => monthEvents.reduce((total, event) => total + event.participantCount, 0),
    [monthEvents],
  );

  const selectedDateEvents = useMemo(
    () => selectedDate ? monthEvents.filter((event) => event.date === selectedDate) : [],
    [monthEvents, selectedDate],
  );

  const { year, month } = monthParts(visibleMonth);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekdayMonday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const calendarCells: Array<number | null> = [
    ...Array.from({ length: firstWeekdayMonday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const eventDays = new Set(monthEvents.map((event) => Number(event.date.slice(8, 10))));
  const highlights = filteredEvents.slice(0, 3);

  function changeMonth(delta: number) {
    setVisibleMonth((current) => moveMonthKey(current, delta));
    setSelectedDate(null);
    setShowMonthList(false);
  }

  function setCalendarDay(day: number) {
    setSelectedDate(`${visibleMonth}-${String(day).padStart(2, "0")}`);
  }

  function toggleRegistration(slug: string) {
    if (!isLoggedIn) return;
    const next = joinedSlugs.includes(slug) ? joinedSlugs.filter((item) => item !== slug) : [...joinedSlugs, slug];
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(registrationChangeEvent));
  }

  function jumpToUpcoming(category: EventCategoryId | "all" = "all") {
    setActiveCategory(category);
    window.setTimeout(() => document.getElementById("events-upcoming")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  if (!featuredEvent) return null;

  const featuredJoined = joinedSlugs.includes(featuredEvent.slug);

  return (
    <main className="events-page">
      <div className="events-breadcrumb-row">
        <div className="events-shell events-breadcrumbs">
          <Link href="/">Home</Link><span>›</span>
          <Link href="/about">British Airways Virtual</Link><span>›</span>
          <Link href="/destinations">Discover</Link><span>›</span>
          <strong>Events</strong>
        </div>
      </div>

      <section className="events-hero-band">
        <div className="events-shell events-hero-grid">
          <article
            className="events-featured"
            style={{ backgroundImage: `url(${featuredEvent.image})`, backgroundPosition: featuredEvent.imagePosition ?? "center" }}
          >
            <div className="events-featured-shade" />
            <div className="events-featured-copy">
              <span className="events-kicker inverse">Featured event</span>
              <h1>{featuredEvent.title}</h1>
              <p className="events-featured-subtitle">{featuredEvent.summary}</p>
              <div className="events-feature-meta">
                <div><EventIcon name="calendar" /><span><strong>{formatEventDate(featuredEvent.date)}</strong>{featuredEvent.startUtc} - {featuredEvent.endUtc} UTC</span></div>
                <div><EventIcon name="pin" /><span><strong>{featuredEvent.route.from} - {featuredEvent.route.to}</strong>{featuredEvent.route.fromName} to {featuredEvent.route.toName}</span></div>
                <div><EventIcon name="plane" /><span><strong>{featuredEvent.typeLabel}</strong>{featuredEvent.aircraftNote}</span></div>
              </div>
              <p className="events-featured-description">{featuredEvent.description}</p>
              {isLoggedIn ? (
                <button className={`events-primary-button light-outline${featuredJoined ? " joined" : ""}`} type="button" onClick={() => toggleRegistration(featuredEvent.slug)}>
                  {featuredJoined ? "Joined ✓" : "Join this event"}<span aria-hidden="true">→</span>
                </button>
              ) : (
                <Link className="events-primary-button light-outline" href="/login">Join this event <span aria-hidden="true">→</span></Link>
              )}
            </div>
          </article>

          <aside className="events-calendar-card" aria-label="Events calendar">
            <div className="events-calendar-main">
              <div className="events-calendar-header">
                <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
                <strong>{monthLabel(visibleMonth)}</strong>
                <button type="button" onClick={() => changeMonth(1)} aria-label="Next month">›</button>
              </div>
              <div className="events-weekdays" aria-hidden="true">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="events-calendar-days">
                {calendarCells.map((day, index) => {
                  if (!day) return <span className="events-calendar-empty" key={`empty-${index}`} />;
                  const dateKey = `${visibleMonth}-${String(day).padStart(2, "0")}`;
                  const hasEvent = eventDays.has(day);
                  const isSelected = selectedDate === dateKey;
                  return (
                    <button
                      className={`${hasEvent ? "has-event " : ""}${isSelected ? "selected" : ""}`.trim()}
                      type="button"
                      key={dateKey}
                      onClick={() => setCalendarDay(day)}
                      aria-label={`${day} ${monthLabel(visibleMonth)}${hasEvent ? ", event scheduled" : ""}`}
                    >
                      {day}
                      {hasEvent && <span className="events-calendar-dot" />}
                    </button>
                  );
                })}
              </div>
              {selectedDate && (
                <div className="events-selected-date">
                  <strong>{selectedDateEvents.length ? `${selectedDateEvents.length} event${selectedDateEvents.length === 1 ? "" : "s"} on ${formatEventDate(selectedDate)}` : `No events on ${formatEventDate(selectedDate)}`}</strong>
                  {selectedDateEvents.map((event) => <button type="button" key={event.id} onClick={() => setSelectedEvent(event)}>{event.title} <span>→</span></button>)}
                </div>
              )}
            </div>

            <div className="events-month-summary">
              <h2>This month</h2>
              <div className="events-summary-stat"><span className="events-circle-icon"><EventIcon name="calendar" /></span><div><strong>{monthEvents.length}</strong><span>upcoming events</span></div></div>
              <div className="events-summary-stat"><span className="events-circle-icon"><EventIcon name="group" /></span><div><strong>{communityPilots.toLocaleString()}</strong><span>community pilots registered</span></div></div>
              <div className="events-summary-stat"><span className="events-circle-icon"><EventIcon name="plane" /></span><div><strong>{destinationsFeatured}</strong><span>destinations featured</span></div></div>
              <button className="events-primary-button compact" type="button" onClick={() => setShowMonthList((current) => !current)}>{showMonthList ? "Hide month list" : "View full calendar"}<span aria-hidden="true">→</span></button>
              {showMonthList && (
                <div className="events-month-list">
                  {monthEvents.length ? monthEvents.map((event) => <button type="button" key={event.id} onClick={() => setSelectedEvent(event)}><span>{event.date.slice(8, 10)}</span>{event.title}</button>) : <p>No published events this month.</p>}
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>

      <section className="events-categories-section">
        <div className="events-shell">
          <span className="events-kicker">Event categories</span>
          <h2>Find the perfect event for your next flight.</h2>
          <p className="events-section-lead">From short hauls to global adventures, there&apos;s always something happening in the British Airways Virtual community.</p>
          <div className="events-category-grid">
            {categories.map((category) => (
              <button
                className={`events-category-card${activeCategory === category.id ? " active" : ""}`}
                type="button"
                key={category.id}
                onClick={() => jumpToUpcoming(category.id)}
                aria-pressed={activeCategory === category.id}
              >
                <span className="events-category-icon"><EventIcon name={categoryIcon(category.icon)} /></span>
                <span className="events-category-copy"><strong>{category.title}</strong><span>{category.description}</span><b>{category.linkLabel} <i aria-hidden="true">→</i></b></span>
                <span className="events-category-image" style={{ backgroundImage: `url(${category.image})` }} />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="events-highlights-band">
        <div className="events-shell">
          <div className="events-heading-row">
            <div>
              <span className="events-kicker">This month&apos;s highlights</span>
              <h2>Not to be missed.</h2>
              <p>Here are some of the key events taking place this month. Join the community and be part of the experience.</p>
            </div>
            <button type="button" onClick={() => jumpToUpcoming("all")}>View all events in {monthLabel(visibleMonth).replace(/ \d{4}$/, "")} <span aria-hidden="true">→</span></button>
          </div>
          <div className="events-highlight-grid">
            {highlights.length ? highlights.map((event) => (
              <article className="events-highlight-card" key={event.id}>
                <div className="events-highlight-image" style={{ backgroundImage: `url(${event.image})`, backgroundPosition: event.imagePosition ?? "center" }} />
                <div className="events-highlight-copy">
                  <span>{event.typeLabel}</span>
                  <h3><button type="button" onClick={() => setSelectedEvent(event)}>{event.title}</button></h3>
                  <div className="events-highlight-meta"><span>▣ {formatEventDate(event.date)}</span><span>⌖ {event.route.from} - {event.route.to}</span></div>
                  <p>{event.summary}</p>
                </div>
                <button className="events-card-arrow" type="button" onClick={() => setSelectedEvent(event)} aria-label={`View ${event.title}`}>›</button>
              </article>
            )) : <div className="events-empty-state">No events match this category in {monthLabel(visibleMonth)}.</div>}
          </div>
        </div>
      </section>

      <section className="events-upcoming-section" id="events-upcoming">
        <div className="events-shell events-upcoming-grid">
          <div>
            <span className="events-kicker">Upcoming events</span>
            <h2>What&apos;s coming up?</h2>
            <p className="events-section-lead">Here are some of the next events in British Airways Virtual. Times are in UTC.</p>
            <div className="events-filter-row" role="group" aria-label="Filter events">
              <button className={activeCategory === "all" ? "active" : ""} type="button" onClick={() => setActiveCategory("all")}>All</button>
              {categories.map((category) => <button className={activeCategory === category.id ? "active" : ""} type="button" key={category.id} onClick={() => setActiveCategory(category.id)}>{category.title}</button>)}
            </div>
            <div className="events-table-wrap">
              <div className="events-table-head"><span>Date</span><span>Event</span><span>Route</span><span>Type</span><span>Status</span></div>
              {filteredEvents.map((event) => {
                const joined = joinedSlugs.includes(event.slug);
                return (
                  <div className="events-table-row" key={event.id}>
                    <span>{formatEventDate(event.date)}</span>
                    <button type="button" onClick={() => setSelectedEvent(event)}>{event.title}</button>
                    <span>{event.route.from} - {event.route.to}</span>
                    <span>{event.typeLabel}</span>
                    <span className={`events-status ${joined ? "joined" : event.featured ? "featured" : "upcoming"}`}>{joined ? "Joined" : event.featured ? "Featured" : "Upcoming"}</span>
                  </div>
                );
              })}
              {!filteredEvents.length && <div className="events-table-empty">No published events match this filter for {monthLabel(visibleMonth)}.</div>}
            </div>
            <button className="events-primary-button table-button" type="button" onClick={() => { setActiveCategory("all"); setShowMonthList(true); document.querySelector(".events-calendar-card")?.scrollIntoView({ behavior: "smooth" }); }}>View all upcoming events <span aria-hidden="true">→</span></button>
          </div>

          <aside className="events-how-card">
            <span className="events-kicker">How events work</span>
            <div className="events-how-step"><span className="events-circle-icon"><EventIcon name="calendar" /></span><div><strong>1. Join an event</strong><p>Browse the event calendar, read the details and register for the ones that interest you.</p></div></div>
            <div className="events-how-step"><span className="events-circle-icon"><EventIcon name="plane" /></span><div><strong>2. Fly and take part</strong><p>Complete the event during the scheduled time and follow any special instructions.</p></div></div>
            <div className="events-how-step"><span className="events-circle-icon"><EventIcon name="medal" /></span><div><strong>3. Earn rewards</strong><p>Receive VA Points, Tier Points and exclusive badges for your participation.</p></div></div>
            <button type="button" onClick={() => setSelectedEvent(featuredEvent)}>Learn more about events <span aria-hidden="true">→</span></button>
          </aside>
        </div>
      </section>

      <section className="events-rewards-section">
        <div className="events-shell events-rewards-grid">
          <div className="events-rewards-heading"><span className="events-kicker">Event rewards</span><h2>More than just a flight.</h2><p>Events bring our community together and offer unique opportunities to earn rewards.</p></div>
          <div className="events-reward"><span className="events-circle-icon"><EventIcon name="coins" /></span><div><strong>VA Points</strong><p>Many events award bonus VA Points for participation.</p></div></div>
          <div className="events-reward"><span className="events-circle-icon"><EventIcon name="bars" /></span><div><strong>Tier Points</strong><p>Selected events can award Tier Points towards your status.</p></div></div>
          <div className="events-reward"><span className="events-circle-icon"><EventIcon name="medal" /></span><div><strong>Exclusive badges</strong><p>Earn unique event badges and feature on the leaderboards.</p></div></div>
        </div>
      </section>

      {selectedEvent && (
        <div className="events-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedEvent(null); }}>
          <section className="events-modal" role="dialog" aria-modal="true" aria-labelledby="events-modal-title">
            <button className="events-modal-close" type="button" onClick={() => setSelectedEvent(null)} aria-label="Close event details">×</button>
            <div className="events-modal-image" style={{ backgroundImage: `url(${selectedEvent.image})`, backgroundPosition: selectedEvent.imagePosition ?? "center" }} />
            <div className="events-modal-body">
              <span className="events-kicker">{selectedEvent.typeLabel}</span>
              <h2 id="events-modal-title">{selectedEvent.title}</h2>
              <p>{selectedEvent.description}</p>
              <div className="events-modal-facts">
                <div><EventIcon name="calendar" /><span><strong>{longEventDate(selectedEvent.date)}</strong>{selectedEvent.startUtc} - {selectedEvent.endUtc} UTC</span></div>
                <div><EventIcon name="pin" /><span><strong>{selectedEvent.route.from} - {selectedEvent.route.to}</strong>{selectedEvent.route.fromName} to {selectedEvent.route.toName}</span></div>
                <div><EventIcon name="plane" /><span><strong>{selectedEvent.aircraftNote}</strong>{selectedEvent.participantCount.toLocaleString()} pilots currently registered</span></div>
                <div><EventIcon name="medal" /><span><strong>{selectedEvent.rewards.vaPoints} VA Points · {selectedEvent.rewards.tierPoints} Tier Points</strong>{selectedEvent.rewards.badge ? `Badge: ${selectedEvent.rewards.badge}` : "Event reward"}</span></div>
              </div>
              <div className="events-modal-actions">
                {isLoggedIn ? (
                  <button className="events-primary-button" type="button" onClick={() => toggleRegistration(selectedEvent.slug)}>{joinedSlugs.includes(selectedEvent.slug) ? "Leave event" : "Join this event"}<span aria-hidden="true">→</span></button>
                ) : (
                  <Link className="events-primary-button" href="/login">Pilot log in to join <span aria-hidden="true">→</span></Link>
                )}
                <button className="events-secondary-button" type="button" onClick={() => setSelectedEvent(null)}>Close</button>
              </div>
              <small>Event registrations are currently stored as local development data and are ready to be replaced by the future shared vAMSYS / website backend.</small>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
