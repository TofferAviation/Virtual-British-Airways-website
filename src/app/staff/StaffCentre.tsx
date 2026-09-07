"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { EventCategoryId, VirtualEvent } from "@/data/events";
import type { ManagedRoute } from "@/lib/route-store";

type Props = {
  initialEvents: VirtualEvent[];
  initialRoutes: ManagedRoute[];
  staffName: string;
};

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function emptyEvent(): VirtualEvent {
  return {
    id: "",
    slug: "",
    title: "",
    typeLabel: "Community Flight",
    category: "community",
    summary: "",
    description: "",
    date: isoToday(),
    startUtc: "17:00",
    endUtc: "22:00",
    route: { from: "EGLL", to: "", fromName: "London Heathrow", toName: "" },
    image: "",
    imagePosition: "center center",
    featured: false,
    published: false,
    registrationOpen: true,
    participantCount: 0,
    featuredDestinations: [],
    aircraftNote: "All aircraft welcome",
    rewards: { vaPoints: 100, tierPoints: 10, badge: "" },
  };
}

function emptyRoute(): ManagedRoute {
  return {
    id: "",
    from: "LHR",
    to: "",
    flightNumber: "BA",
    departure: "08:00",
    arrival: "10:00",
    duration: "2h 00m",
    aircraft: "Airbus A320neo",
    slots: 10,
    active: true,
  };
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function eventStatus(event: VirtualEvent) {
  if (!event.published) return { label: "Draft", className: "draft" };
  if (event.featured) return { label: "Featured", className: "featured" };
  return { label: "Published", className: "published" };
}

export function StaffCentre({ initialEvents, initialRoutes, staffName }: Props) {
  const [events, setEvents] = useState(initialEvents);
  const [routes, setRoutes] = useState(initialRoutes);
  const [eventDraft, setEventDraft] = useState<VirtualEvent | null>(null);
  const [routeDraft, setRouteDraft] = useState<ManagedRoute | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const upcoming = useMemo(() => {
    const today = isoToday();
    return [...events].filter((event) => event.date >= today).sort((a, b) => `${a.date}${a.startUtc}`.localeCompare(`${b.date}${b.startUtc}`));
  }, [events]);

  const activeEventCount = upcoming.filter((event) => event.published).length;
  const activeRouteCount = routes.filter((route) => route.active).length;
  const draftCount = events.filter((event) => !event.published).length;

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveEvent() {
    if (!eventDraft) return;
    setSaving(true);
    setMessage("");
    try {
      const isNew = !eventDraft.id;
      const response = await fetch("/api/staff/events", {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? { event: eventDraft } : { id: eventDraft.id, event: eventDraft }),
      });
      const body = (await response.json()) as { event?: VirtualEvent; error?: string };
      if (!response.ok || !body.event) throw new Error(body.error || "Could not save event.");
      setEvents((current) => isNew ? [...current, body.event!] : current.map((item) => item.id === body.event!.id ? body.event! : item));
      setEventDraft(null);
      setMessage(isNew ? "Event created. It will appear publicly when Published is enabled." : "Event changes saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save event.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent() {
    if (!eventDraft?.id || !window.confirm(`Delete ${eventDraft.title}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/staff/events?id=${encodeURIComponent(eventDraft.id)}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not delete event.");
      setEvents((current) => current.filter((item) => item.id !== eventDraft.id));
      setEventDraft(null);
      setMessage("Event deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete event.");
    } finally {
      setSaving(false);
    }
  }

  async function saveRoute() {
    if (!routeDraft) return;
    setSaving(true);
    setMessage("");
    try {
      const isNew = !routeDraft.id;
      const response = await fetch("/api/staff/routes", {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? { route: routeDraft } : { id: routeDraft.id, route: routeDraft }),
      });
      const body = (await response.json()) as { route?: ManagedRoute; error?: string };
      if (!response.ok || !body.route) throw new Error(body.error || "Could not save route.");
      setRoutes((current) => isNew ? [...current, body.route!] : current.map((item) => item.id === body.route!.id ? body.route! : item));
      setRouteDraft(null);
      setMessage(isNew ? "Route override created. Flight search now uses it for that city pair." : "Route override updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save route.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRoute() {
    if (!routeDraft?.id || !window.confirm(`Delete ${routeDraft.flightNumber} ${routeDraft.from}-${routeDraft.to}?`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/staff/routes?id=${encodeURIComponent(routeDraft.id)}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Could not delete route.");
      setRoutes((current) => current.filter((item) => item.id !== routeDraft.id));
      setRouteDraft(null);
      setMessage("Route override removed. Flight search will fall back to the default development schedule for that route.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete route.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="staff-shell staff-hero">
        <div className="staff-hero-copy">
          <span className="staff-kicker">Staff centre</span>
          <h1>Manage the virtual airline<br />behind the scenes.</h1>
          <p>Edit routes, publish events, update operational content and manage the parts of British Airways Virtual that already have live website data.</p>
          <a className="staff-primary-button" href="/api/health" target="_blank" rel="noreferrer">View operational status <span>→</span></a>
        </div>
        <div className="staff-overview-card">
          <div className="staff-overview-heading"><h2>Admin overview</h2><span>{staffName}</span></div>
          <div className="staff-overview-grid">
            <button onClick={() => scrollTo("staff-events")}><span className="staff-overview-icon">□</span><strong>{activeEventCount}</strong><small>Published upcoming events</small></button>
            <button onClick={() => scrollTo("route-tools")}><span className="staff-overview-icon">✈</span><strong>{activeRouteCount}</strong><small>Custom route overrides</small></button>
            <button onClick={() => scrollTo("support-tools")}><span className="staff-overview-icon">◎</span><strong>0</strong><small>Connected support queues</small></button>
            <button onClick={() => scrollTo("website-tools")}><span className="staff-overview-icon">▤</span><strong>{draftCount}</strong><small>Event drafts</small></button>
          </div>
        </div>
      </section>

      {message ? <div className="staff-shell staff-message" role="status">{message}<button onClick={() => setMessage("")}>×</button></div> : null}

      <section className="staff-shell staff-quick-section">
        <span className="staff-kicker">Quick actions</span>
        <p>Common tasks, all in one place.</p>
        <div className="staff-quick-grid">
          <button onClick={() => setEventDraft(emptyEvent())}><span>□</span><b>Create event</b><small>Set up and publish a new community event.</small><i>›</i></button>
          <button onClick={() => scrollTo("route-tools")}><span>✈</span><b>Edit routes</b><small>Add or change route overrides and schedules.</small><i>›</i></button>
          <button onClick={() => scrollTo("website-tools")}><span>◀</span><b>Website content</b><small>Open the content pages available today.</small><i>›</i></button>
          <button onClick={() => scrollTo("support-tools")}><span>✉</span><b>Support tools</b><small>Review the connected support status.</small><i>›</i></button>
          <button onClick={() => scrollTo("admin-tools")}><span>◎</span><b>User roles</b><small>Review current staff access and permissions.</small><i>›</i></button>
          <Link href="/events"><span>▤</span><b>Public events page</b><small>Review what pilots can currently see.</small><i>›</i></Link>
        </div>
      </section>

      <section className="staff-shell staff-two-column" id="staff-events">
        <div className="staff-panel staff-events-panel">
          <div className="staff-panel-heading">
            <div><span className="staff-kicker">Upcoming events</span><h2>Manage upcoming events</h2><p>Changes saved here feed directly into the public Events page.</p></div>
            <button className="staff-text-button" onClick={() => setEventDraft(emptyEvent())}>Create event →</button>
          </div>
          <div className="staff-table-wrap">
            <table className="staff-table">
              <thead><tr><th>Date</th><th>Event</th><th>Route</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {upcoming.slice(0, 8).map((event) => {
                  const status = eventStatus(event);
                  return <tr key={event.id}>
                    <td>{formatDate(event.date)}</td><td><strong>{event.title}</strong></td><td>{event.route.from} – {event.route.to}</td><td>{event.typeLabel}</td>
                    <td><span className={`staff-status ${status.className}`}>{status.label}</span></td>
                    <td><button className="staff-edit-button" onClick={() => setEventDraft(event)}>Edit <span>›</span></button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="staff-panel" id="route-tools">
          <div className="staff-panel-heading"><div><span className="staff-kicker">Route and schedule tools</span><h2>Manage our virtual network</h2><p>Custom overrides update flight-search results immediately.</p></div></div>
          <div className="staff-tool-list">
            <button onClick={() => setRouteDraft(emptyRoute())}><span>✈</span><b>Add route</b><small>Create a route override and flight details.</small><i>›</i></button>
            <button onClick={() => setRouteDraft(routes[0] ?? emptyRoute())}><span>⚙</span><b>Edit aircraft assignment</b><small>Change the aircraft on an existing route.</small><i>›</i></button>
            <Link href="/book"><span>□</span><b>Preview availability</b><small>Open the public flight search.</small><i>›</i></Link>
            <a href="/api/health" target="_blank" rel="noreferrer"><span>↥</span><b>Service health</b><small>Check the current website API status.</small><i>›</i></a>
          </div>
          <div className="staff-route-summary">
            <strong>{activeRouteCount ? `${activeRouteCount} active custom route override${activeRouteCount === 1 ? "" : "s"}` : "No custom route overrides yet"}</strong>
            <span>{activeRouteCount ? "These routes take priority over the development fallback schedule." : "Flight search is currently using the existing development fallback schedule."}</span>
          </div>
          {routes.length ? <div className="staff-mini-routes">{routes.slice(0, 5).map((route) => <button key={route.id} onClick={() => setRouteDraft(route)}><strong>{route.flightNumber}</strong><span>{route.from} → {route.to}</span><small>{route.aircraft}</small></button>)}</div> : null}
        </div>
      </section>

      <section className="staff-shell staff-two-column staff-lower-row">
        <div className="staff-panel" id="website-tools">
          <div className="staff-panel-heading"><div><span className="staff-kicker">Homepage and page content</span><h2>Keep our website up to date</h2><p>Open the current public pages. Structured content editing can be moved into this centre as each page is converted to a data-backed model.</p></div></div>
          <div className="staff-content-list">
            <Link href="/"><span>▧</span><b>Homepage</b><small>Hero, search and featured website content.</small><em>Open →</em></Link>
            <Link href="/va-points"><span>▥</span><b>VA Points page</b><small>Progression and rewards information.</small><em>Open →</em></Link>
            <Link href="/tier-points"><span>☆</span><b>Tier Points page</b><small>Status information and examples.</small><em>Open →</em></Link>
            <Link href="/help"><span>?</span><b>Help centre</b><small>FAQs and support content.</small><em>Open →</em></Link>
            <Link href="/oneworld"><span>◎</span><b>Partners page</b><small>oneworld Virtual information.</small><em>Open →</em></Link>
          </div>
        </div>

        <div className="staff-panel" id="support-tools">
          <div className="staff-panel-heading"><div><span className="staff-kicker">Pilot support and moderation</span><h2>Support our community</h2><p>Support inbox and moderation counts will become live when a support backend is connected.</p></div></div>
          <div className="staff-content-list">
            <Link href="/help"><span>✉</span><b>Help centre</b><small>Current pilot-facing support tools.</small><em>View →</em></Link>
            <Link href="/events"><span>●</span><b>Events and community</b><small>Review published community events.</small><em>View →</em></Link>
            <Link href="/about-your-account"><span>✈</span><b>Account guidance</b><small>Review account onboarding information.</small><em>View →</em></Link>
            <Link href="/account"><span>◇</span><b>Account preview</b><small>Inspect the current pilot dashboard experience.</small><em>View →</em></Link>
          </div>
        </div>
      </section>

      <section className="staff-shell staff-admin-strip" id="admin-tools">
        <div><span className="staff-kicker">Admin tools</span><h2>Operational controls</h2><p>Additional tools and security settings for administrators.</p></div>
        <div className="staff-admin-actions">
          <button><span>⚙</span><b>User permissions</b><small>Current role: Administrator</small></button>
          <a href="/api/health" target="_blank" rel="noreferrer"><span>◔</span><b>Service status</b><small>View API health</small></a>
          <button onClick={() => scrollTo("staff-events")}><span>▤</span><b>Event drafts</b><small>{draftCount} saved draft{draftCount === 1 ? "" : "s"}</small></button>
          <a href="/api/staff/logout"><span>▯</span><b>Staff sign out</b><small>End this staff session</small></a>
        </div>
      </section>

      <section className="staff-shell staff-runtime-note">
        <strong>Development persistence</strong>
        <p>Event and route changes are stored in <code>.bav-data</code> on the Node.js server. This is fully functional for local development and persistent Node hosting. Before launch on serverless hosting, this storage adapter should be switched to the shared production database/vAMSYS-backed API so changes persist across deployments.</p>
      </section>

      {eventDraft ? (
        <div className="staff-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEventDraft(null); }}>
          <div className="staff-modal" role="dialog" aria-modal="true" aria-label={eventDraft.id ? "Edit event" : "Create event"}>
            <div className="staff-modal-heading"><div><span className="staff-kicker">Event editor</span><h2>{eventDraft.id ? "Edit event" : "Create new event"}</h2></div><button onClick={() => setEventDraft(null)} disabled={saving}>×</button></div>
            <div className="staff-form-grid">
              <label className="wide"><span>Event title</span><input value={eventDraft.title} onChange={(e) => setEventDraft({ ...eventDraft, title: e.target.value })} /></label>
              <label><span>Category</span><select value={eventDraft.category} onChange={(e) => setEventDraft({ ...eventDraft, category: e.target.value as EventCategoryId })}><option value="community">Community</option><option value="long-haul">Long-haul</option><option value="challenge">Challenge</option></select></label>
              <label><span>Type label</span><input value={eventDraft.typeLabel} onChange={(e) => setEventDraft({ ...eventDraft, typeLabel: e.target.value })} /></label>
              <label><span>Date</span><input type="date" value={eventDraft.date} onChange={(e) => setEventDraft({ ...eventDraft, date: e.target.value })} /></label>
              <label><span>Start UTC</span><input type="time" value={eventDraft.startUtc} onChange={(e) => setEventDraft({ ...eventDraft, startUtc: e.target.value })} /></label>
              <label><span>End UTC</span><input type="time" value={eventDraft.endUtc} onChange={(e) => setEventDraft({ ...eventDraft, endUtc: e.target.value })} /></label>
              <label><span>From ICAO</span><input value={eventDraft.route.from} onChange={(e) => setEventDraft({ ...eventDraft, route: { ...eventDraft.route, from: e.target.value.toUpperCase() } })} /></label>
              <label><span>To ICAO</span><input value={eventDraft.route.to} onChange={(e) => setEventDraft({ ...eventDraft, route: { ...eventDraft.route, to: e.target.value.toUpperCase() } })} /></label>
              <label><span>From name</span><input value={eventDraft.route.fromName} onChange={(e) => setEventDraft({ ...eventDraft, route: { ...eventDraft.route, fromName: e.target.value } })} /></label>
              <label><span>To name</span><input value={eventDraft.route.toName} onChange={(e) => setEventDraft({ ...eventDraft, route: { ...eventDraft.route, toName: e.target.value } })} /></label>
              <label className="wide"><span>Summary</span><input value={eventDraft.summary} onChange={(e) => setEventDraft({ ...eventDraft, summary: e.target.value })} /></label>
              <label className="wide"><span>Description</span><textarea rows={4} value={eventDraft.description} onChange={(e) => setEventDraft({ ...eventDraft, description: e.target.value })} /></label>
              <label className="wide"><span>Hero / event image URL</span><input value={eventDraft.image} onChange={(e) => setEventDraft({ ...eventDraft, image: e.target.value })} placeholder="https://… or /branding/event-image.jpg" /></label>
              <label><span>Aircraft note</span><input value={eventDraft.aircraftNote} onChange={(e) => setEventDraft({ ...eventDraft, aircraftNote: e.target.value })} /></label>
              <label><span>Featured destinations</span><input value={eventDraft.featuredDestinations.join(", ")} onChange={(e) => setEventDraft({ ...eventDraft, featuredDestinations: e.target.value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean) })} /></label>
              <label><span>VA Points</span><input type="number" min="0" value={eventDraft.rewards.vaPoints} onChange={(e) => setEventDraft({ ...eventDraft, rewards: { ...eventDraft.rewards, vaPoints: Number(e.target.value) } })} /></label>
              <label><span>Tier Points</span><input type="number" min="0" value={eventDraft.rewards.tierPoints} onChange={(e) => setEventDraft({ ...eventDraft, rewards: { ...eventDraft.rewards, tierPoints: Number(e.target.value) } })} /></label>
              <label className="wide"><span>Badge name</span><input value={eventDraft.rewards.badge ?? ""} onChange={(e) => setEventDraft({ ...eventDraft, rewards: { ...eventDraft.rewards, badge: e.target.value } })} /></label>
            </div>
            <div className="staff-check-row">
              <label><input type="checkbox" checked={Boolean(eventDraft.published)} onChange={(e) => setEventDraft({ ...eventDraft, published: e.target.checked })} /> Published on Events page</label>
              <label><input type="checkbox" checked={Boolean(eventDraft.featured)} onChange={(e) => setEventDraft({ ...eventDraft, featured: e.target.checked })} /> Featured event</label>
              <label><input type="checkbox" checked={eventDraft.registrationOpen} onChange={(e) => setEventDraft({ ...eventDraft, registrationOpen: e.target.checked })} /> Registration open</label>
            </div>
            <div className="staff-modal-actions">
              {eventDraft.id ? <button className="staff-danger-button" onClick={removeEvent} disabled={saving}>Delete event</button> : <span />}
              <div><button className="staff-secondary-button" onClick={() => setEventDraft(null)} disabled={saving}>Cancel</button><button className="staff-primary-button" onClick={saveEvent} disabled={saving}>{saving ? "Saving…" : eventDraft.published ? "Save & publish" : "Save draft"}</button></div>
            </div>
          </div>
        </div>
      ) : null}

      {routeDraft ? (
        <div className="staff-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setRouteDraft(null); }}>
          <div className="staff-modal staff-route-modal" role="dialog" aria-modal="true" aria-label={routeDraft.id ? "Edit route" : "Create route"}>
            <div className="staff-modal-heading"><div><span className="staff-kicker">Route editor</span><h2>{routeDraft.id ? "Edit route override" : "Add route override"}</h2></div><button onClick={() => setRouteDraft(null)} disabled={saving}>×</button></div>
            <p className="staff-modal-lead">A custom route override replaces the development fallback flights for the same From/To pair on the Book page.</p>
            <div className="staff-form-grid">
              <label><span>From IATA</span><input value={routeDraft.from} onChange={(e) => setRouteDraft({ ...routeDraft, from: e.target.value.toUpperCase() })} /></label>
              <label><span>To IATA</span><input value={routeDraft.to} onChange={(e) => setRouteDraft({ ...routeDraft, to: e.target.value.toUpperCase() })} /></label>
              <label><span>Flight number</span><input value={routeDraft.flightNumber} onChange={(e) => setRouteDraft({ ...routeDraft, flightNumber: e.target.value.toUpperCase() })} /></label>
              <label><span>Aircraft</span><input value={routeDraft.aircraft} onChange={(e) => setRouteDraft({ ...routeDraft, aircraft: e.target.value })} /></label>
              <label><span>Departure</span><input type="time" value={routeDraft.departure} onChange={(e) => setRouteDraft({ ...routeDraft, departure: e.target.value })} /></label>
              <label><span>Arrival</span><input type="time" value={routeDraft.arrival} onChange={(e) => setRouteDraft({ ...routeDraft, arrival: e.target.value })} /></label>
              <label><span>Duration</span><input value={routeDraft.duration} onChange={(e) => setRouteDraft({ ...routeDraft, duration: e.target.value })} placeholder="2h 10m" /></label>
              <label><span>Pilot slots</span><input type="number" min="0" value={routeDraft.slots} onChange={(e) => setRouteDraft({ ...routeDraft, slots: Number(e.target.value) })} /></label>
            </div>
            <div className="staff-check-row"><label><input type="checkbox" checked={routeDraft.active} onChange={(e) => setRouteDraft({ ...routeDraft, active: e.target.checked })} /> Route active</label></div>
            <div className="staff-modal-actions">
              {routeDraft.id ? <button className="staff-danger-button" onClick={removeRoute} disabled={saving}>Delete route</button> : <span />}
              <div><button className="staff-secondary-button" onClick={() => setRouteDraft(null)} disabled={saving}>Cancel</button><button className="staff-primary-button" onClick={saveRoute} disabled={saving}>{saving ? "Saving…" : "Save route"}</button></div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
