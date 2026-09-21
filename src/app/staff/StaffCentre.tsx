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
    flightNumber: "",
    callsign: "",
    departure: "08:00",
    arrival: "10:00",
    duration: "2h 00m",
    aircraft: "Airbus A320neo",
    aircraftOptions: [],
    slots: 10,
    active: true,
    validFrom: isoToday(),
    operatingDays: [],
    sourceUrl: "https://www.britishairways.com/travel/schedules/public/en_gb",
    validatedAt: isoToday(),
    scheduleScoringEnabled: false,
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
  const [timetableImportOpen, setTimetableImportOpen] = useState(false);
  const [timetableCsv, setTimetableCsv] = useState("");
  const [routeSearch, setRouteSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const upcoming = useMemo(() => {
    const today = isoToday();
    return [...events].filter((event) => event.date >= today).sort((a, b) => `${a.date}${a.startUtc}`.localeCompare(`${b.date}${b.startUtc}`));
  }, [events]);

  const activeEventCount = upcoming.filter((event) => event.published).length;
  const activeRouteCount = new Set(routes.filter((route) => route.active).map((route) => `${route.from}-${route.to}`)).size;
  const verifiedScheduleCount = routes.filter((route) => route.active && !route.catalogueOnly && !route.virtualTimetable).length;
  const virtualScheduleCount = routes.filter((route) => route.active && route.virtualTimetable).length;
  const timetableRecords = useMemo(() => routes.filter((route) => !route.catalogueOnly).sort((left, right) => `${left.from}${left.to}${left.flightNumber}`.localeCompare(`${right.from}${right.to}${right.flightNumber}`)), [routes]);
  const matchingTimetableRecords = useMemo(() => {
    const search = routeSearch.trim().toLowerCase();
    if (!search) return timetableRecords;
    return timetableRecords.filter((route) => `${route.flightNumber} ${route.callsign ?? ""} ${route.from} ${route.to} ${route.aircraft}`.toLowerCase().includes(search));
  }, [routeSearch, timetableRecords]);
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
      setMessage(isNew ? "Verified service created. It is now available to pilots for that city pair." : "Verified service updated.");
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
      setMessage("Verified service removed. The BA network catalogue card remains available for that city pair.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete route.");
    } finally {
      setSaving(false);
    }
  }

  async function importTimetable() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/staff/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timetableCsv }),
      });
      const body = (await response.json()) as { routes?: ManagedRoute[]; created?: number; updated?: number; error?: string };
      if (!response.ok || !body.routes) throw new Error(body.error || "Could not import the timetable.");
      setRoutes(body.routes);
      setTimetableImportOpen(false);
      setTimetableCsv("");
      setMessage(`Verified timetable imported: ${body.created ?? 0} new service record${body.created === 1 ? "" : "s"}, ${body.updated ?? 0} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import the timetable.");
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
            <button onClick={() => scrollTo("route-tools")}><span className="staff-overview-icon">✈</span><strong>{activeRouteCount}</strong><small>Published BAV city pairs</small></button>
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
          <div className="staff-panel-heading"><div><span className="staff-kicker">Route and schedule tools</span><h2>Manage our virtual network</h2><p>BAV virtual services keep every published city pair bookable. Confirmed BA services remain separately controlled with their real BA flight number, BAW callsign, local times and scheduled aircraft.</p></div></div>
          <div className="staff-tool-list">
            <button onClick={() => setRouteDraft(emptyRoute())}><span>✈</span><b>Add verified service</b><small>Enter a confirmed BA flight manually.</small><i>›</i></button>
            <button onClick={() => setTimetableImportOpen(true)}><span>↥</span><b>Import timetable CSV</b><small>Publish many verified BA services safely.</small><i>›</i></button>
            <button onClick={() => setRouteDraft(timetableRecords[0] ?? emptyRoute())}><span>⚙</span><b>Manage timetable records</b><small>Correct service times, aircraft or scoring rules.</small><i>›</i></button>
            <Link href="/book"><span>□</span><b>Preview availability</b><small>Open the public flight search.</small><i>›</i></Link>
            <a href="/api/health" target="_blank" rel="noreferrer"><span>↥</span><b>Service health</b><small>Check the current website API status.</small><i>›</i></a>
          </div>
          <div className="staff-route-summary">
            <strong>{activeRouteCount} active BAV city pair{activeRouteCount === 1 ? "" : "s"} · {virtualScheduleCount} BAV virtual service{virtualScheduleCount === 1 ? "" : "s"} · {verifiedScheduleCount} verified BA service record{verifiedScheduleCount === 1 ? "" : "s"}</strong>
            <span>A verified BA service takes priority over the matching BAV virtual service on the Book page.</span>
          </div>
          {timetableRecords.length ? <div className="staff-timetable-records"><label><span>Find a timetable record</span><input value={routeSearch} onChange={(event) => setRouteSearch(event.target.value)} placeholder="Flight number, callsign, airport or aircraft" /></label><div className="staff-mini-routes">{matchingTimetableRecords.slice(0, 20).map((route) => <button key={route.id} onClick={() => setRouteDraft(route)}><strong>{route.flightNumber}{route.callsign ? ` · ${route.callsign}` : ""}</strong><span>{route.from} → {route.to} · {route.departure}–{route.arrival} {route.virtualTimetable ? "UTC reference" : "local"}</span><small>{route.aircraft}{route.virtualTimetable ? " · BAV virtual service" : route.scheduleScoringEnabled ? " · schedule scoring on" : " · verified BA timetable"}</small></button>)}</div>{matchingTimetableRecords.length > 20 ? <small className="staff-timetable-limit">Showing the first 20 matching records. Narrow the search to edit a specific service.</small> : null}</div> : null}
        </div>
      </section>

      <section className="staff-shell staff-two-column staff-lower-row">
        <div className="staff-panel" id="website-tools">
          <div className="staff-panel-heading"><div><span className="staff-kicker">Homepage and page content</span><h2>Keep our website up to date</h2><p>Open the current public pages. Structured content editing can be moved into this centre as each page is converted to a data-backed model.</p></div></div>
          <div className="staff-content-list">
            <Link href="/"><span>▧</span><b>Homepage</b><small>Hero, search and featured website content.</small><em>Open →</em></Link>
            <Link href="/va-points"><span>▥</span><b>VA Points page</b><small>Progression and rewards information.</small><em>Open →</em></Link>
            <Link href="/tier-points"><span>☆</span><b>Tier Points page</b><small>Status information and examples.</small><em>Open →</em></Link>
            <Link href="/handbook"><span>?</span><b>BAV Handbook</b><small>Pilot and Staff Centre procedures.</small><em>Open →</em></Link>
            <Link href="/oneworld"><span>◎</span><b>Partners page</b><small>oneworld Virtual information.</small><em>Open →</em></Link>
          </div>
        </div>

        <div className="staff-panel" id="support-tools">
          <div className="staff-panel-heading"><div><span className="staff-kicker">Pilot support and moderation</span><h2>Support our community</h2><p>Support inbox and moderation counts will become live when a support backend is connected.</p></div></div>
          <div className="staff-content-list">
            <Link href="/handbook"><span>✉</span><b>BAV Handbook</b><small>Current pilot and staff guidance.</small><em>View →</em></Link>
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
          <a href="/api/auth/logout"><span>▯</span><b>Sign out</b><small>End this BAV account session</small></a>
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
            <p className="staff-modal-lead">{routeDraft.virtualTimetable ? "This is BAV’s own bookable operational schedule for a real network city pair. Its BAV reference, UTC planning time and approved virtual aircraft must remain clearly separate from a verified BA timetable." : "Publish a verified BA service with its real BA flight number, BAW callsign, local airport times and scheduled aircraft. Add the source and verification date so staff can audit it later. Times are a pilot reference by default, not a points penalty. It replaces the matching BAV virtual service on the Book page."}</p>
            <div className="staff-form-grid">
              <label><span>From IATA</span><input value={routeDraft.from} onChange={(e) => setRouteDraft({ ...routeDraft, from: e.target.value.toUpperCase() })} /></label>
              <label><span>To IATA</span><input value={routeDraft.to} onChange={(e) => setRouteDraft({ ...routeDraft, to: e.target.value.toUpperCase() })} /></label>
              <label><span>{routeDraft.virtualTimetable ? "BAV service reference" : "BA flight number"}</span><input value={routeDraft.flightNumber} onChange={(e) => setRouteDraft({ ...routeDraft, flightNumber: e.target.value.toUpperCase() })} placeholder={routeDraft.virtualTimetable ? "BAV1001" : "BA267"} /></label>
              <label><span>ICAO callsign</span><input value={routeDraft.callsign ?? ""} onChange={(e) => setRouteDraft({ ...routeDraft, callsign: e.target.value.toUpperCase() })} placeholder={routeDraft.virtualTimetable ? "BAW1001" : "BAW267"} /></label>
              <label><span>Aircraft</span><input value={routeDraft.aircraft} onChange={(e) => setRouteDraft({ ...routeDraft, aircraft: e.target.value })} /></label>
              <label><span>Departure</span><input type="time" value={routeDraft.departure} onChange={(e) => setRouteDraft({ ...routeDraft, departure: e.target.value })} /></label>
              <label><span>Arrival</span><input type="time" value={routeDraft.arrival} onChange={(e) => setRouteDraft({ ...routeDraft, arrival: e.target.value })} /></label>
              <label><span>Duration</span><input value={routeDraft.duration} onChange={(e) => setRouteDraft({ ...routeDraft, duration: e.target.value })} placeholder="2h 10m" /></label>
              <label><span>Pilot slots</span><input type="number" min="0" value={routeDraft.slots} onChange={(e) => setRouteDraft({ ...routeDraft, slots: Number(e.target.value) })} /></label>
              <label><span>Approved virtual substitutes</span><input value={(routeDraft.aircraftOptions ?? []).join(", ")} onChange={(e) => setRouteDraft({ ...routeDraft, aircraftOptions: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="Airbus A320, Airbus A319" /></label>
              <label><span>{routeDraft.virtualTimetable ? "BA route-network reference" : "Official timetable source"}</span><input type="url" value={routeDraft.sourceUrl ?? ""} onChange={(e) => setRouteDraft({ ...routeDraft, sourceUrl: e.target.value })} placeholder="https://…" /></label>
              <label><span>{routeDraft.virtualTimetable ? "BAV schedule published" : "Verified on"}</span><input type="date" value={routeDraft.validatedAt ?? ""} onChange={(e) => setRouteDraft({ ...routeDraft, validatedAt: e.target.value })} /></label>
              <label><span>Valid from</span><input type="date" value={routeDraft.validFrom ?? ""} onChange={(e) => setRouteDraft({ ...routeDraft, validFrom: e.target.value })} /></label>
              <label><span>Valid until (optional)</span><input type="date" value={routeDraft.validUntil ?? ""} onChange={(e) => setRouteDraft({ ...routeDraft, validUntil: e.target.value })} /></label>
              <label><span>Operating days</span><input value={(routeDraft.operatingDays ?? []).join(", ")} onChange={(e) => setRouteDraft({ ...routeDraft, operatingDays: e.target.value.split(",").map((item) => Number(item.trim())).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) })} placeholder="0 Sun, 1 Mon … 6 Sat" /></label>
            </div>
            <div className="staff-check-row"><label><input type="checkbox" checked={routeDraft.active} onChange={(e) => setRouteDraft({ ...routeDraft, active: e.target.checked })} /> Route active</label><label><input type="checkbox" checked={routeDraft.scheduleScoringEnabled === true} onChange={(e) => setRouteDraft({ ...routeDraft, scheduleScoringEnabled: e.target.checked })} /> Apply late-start VA-point adjustment to new bookings</label></div>
            <div className="staff-modal-actions">
              {routeDraft.id ? <button className="staff-danger-button" onClick={removeRoute} disabled={saving}>Delete route</button> : <span />}
              <div><button className="staff-secondary-button" onClick={() => setRouteDraft(null)} disabled={saving}>Cancel</button><button className="staff-primary-button" onClick={saveRoute} disabled={saving}>{saving ? "Saving…" : "Save route"}</button></div>
            </div>
          </div>
        </div>
      ) : null}

      {timetableImportOpen ? (
        <div className="staff-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setTimetableImportOpen(false); }}>
          <div className="staff-modal staff-route-modal" role="dialog" aria-modal="true" aria-label="Import verified timetable">
            <div className="staff-modal-heading"><div><span className="staff-kicker">Verified timetable import</span><h2>Publish real BA services in bulk</h2></div><button onClick={() => setTimetableImportOpen(false)} disabled={saving}>×</button></div>
            <p className="staff-modal-lead">Paste a CSV exported from your checked source. Each row is validated before anything is published: it must contain a real BA flight number, its BAW callsign, the three-letter airports, local times, aircraft, source link and verification date. Duplicate services update safely; city-pair catalogue cards remain untouched.</p>
            <label className="staff-import-label"><span>CSV format</span><code>flightNumber,callsign,from,to,departure,arrival,duration,aircraft,aircraftOptions,slots,validFrom,validUntil,operatingDays,sourceUrl,validatedAt,scheduleScoringEnabled,active</code></label>
            <label className="staff-import-label"><span>Verified timetable CSV</span><textarea rows={12} value={timetableCsv} onChange={(event) => setTimetableCsv(event.target.value)} placeholder={"BA267,BAW267,LHR,PDX,15:40,17:40,10h 00m,Boeing 787-10,Boeing 787-10,12,2026-09-01,2026-09-30,0;1;2;3;4;5;6,https://www.britishairways.com/travel/schedules/public/en_gb,2026-09-19,false,true"} /></label>
            <div className="staff-modal-actions"><span /><div><button className="staff-secondary-button" onClick={() => setTimetableImportOpen(false)} disabled={saving}>Cancel</button><button className="staff-primary-button" onClick={importTimetable} disabled={saving || !timetableCsv.trim()}>{saving ? "Importing…" : "Validate & publish timetable"}</button></div></div>
          </div>
        </div>
      ) : null}
    </>
  );
}
