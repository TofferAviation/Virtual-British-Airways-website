"use client";

import { FormEvent, useState } from "react";

type VoiceRoomStatus = "scheduled" | "open" | "closed";
type VoiceRoom = { id: string; slug: string; name: string; description: string; eventId: string | null; startsAt: string | null; endsAt: string | null; status: VoiceRoomStatus };
type PublishedEvent = { id: string; title: string; date: string; startUtc: string; route: string };
type Pilot = { id: string; name: string; pilotNumber: string };
type Props = { initialRooms: VoiceRoom[]; publishedEvents: PublishedEvent[]; pilots: Pilot[] };

function localTime(value: string | null) { return value ? `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value))} UTC` : "No schedule set"; }
function roomBadge(status: VoiceRoomStatus) { return status === "open" ? "Open now" : status === "scheduled" ? "Scheduled" : "Closed"; }

export function VoiceRoomControl({ initialRooms, publishedEvents, pilots }: Props) {
  const [rooms, setRooms] = useState(initialRooms);
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [description, setDescription] = useState("");
  const [eventId, setEventId] = useState(""); const [startsAt, setStartsAt] = useState(""); const [endsAt, setEndsAt] = useState(""); const [briefingPicPilotId, setBriefingPicPilotId] = useState("");
  const [roomPicSelections, setRoomPicSelections] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<VoiceRoomStatus>("scheduled"); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");

  async function createRoom(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/staff/voice-rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: { name, slug, description, eventId: eventId || null, startsAt: startsAt || null, endsAt: endsAt || null, status, briefingPicPilotId: briefingPicPilotId || null } }) });
      const body = await response.json().catch(() => null) as { error?: string; room?: VoiceRoom } | null;
      if (!response.ok || !body?.room) throw new Error(body?.error || "The voice room could not be created.");
      setRooms((current) => [...current, body.room!]); setName(""); setSlug(""); setDescription(""); setEventId(""); setStartsAt(""); setEndsAt(""); setBriefingPicPilotId(""); setStatus("scheduled"); setMessage(`“${body.room.name}” is ready for pilots.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The voice room could not be created."); } finally { setBusy(false); }
  }

  async function changeStatus(id: string, nextStatus: VoiceRoomStatus) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/staff/voice-rooms", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status: nextStatus }) });
      const body = await response.json().catch(() => null) as { error?: string; room?: VoiceRoom } | null;
      if (!response.ok || !body?.room) throw new Error(body?.error || "The room status could not be changed.");
      setRooms((current) => current.map((room) => room.id === id ? body.room! : room)); setMessage(`Room status updated to ${roomBadge(body.room.status).toLowerCase()}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The room status could not be changed."); } finally { setBusy(false); }
  }

  async function assignPic(id: string) {
    const picPilotId = roomPicSelections[id];
    if (!picPilotId) { setMessage("Choose a pilot before assigning the PIC."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/staff/voice-rooms", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, briefingPicPilotId: picPilotId }) });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "The PIC could not be assigned.");
      setMessage("PIC assigned. They can now publish their active booking from the room.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The PIC could not be assigned."); } finally { setBusy(false); }
  }

  return <main className="staff-page voice-room-settings-page">
    <div className="staff-breadcrumb-band"><div className="staff-shell staff-breadcrumbs"><a href="/staff">Staff centre</a><span>›</span><strong>Crew Lounge voice rooms</strong></div></div>
    <section className="staff-shell voice-room-settings-shell">
      <header className="voice-room-settings-hero"><span className="staff-kicker">Community &amp; systems</span><h1>Voice rooms</h1><p>Create a focused place for a community event, route-planning session or staff briefing. Pilots see only rooms you schedule or open.</p></header>
      <div className="voice-room-settings-grid">
        <form className="voice-room-create-card" onSubmit={createRoom}>
          <div><span className="staff-kicker">New room</span><h2>Set up a place to meet</h2><p>The room’s title is shown to pilots. Its meeting address is generated separately so staff labels never become a public meeting link.</p></div>
          <label className="crew-lounge-field"><span>Room name</span><input required maxLength={80} value={name} placeholder="Friday event room" onChange={(event) => { setName(event.target.value); if (!slug) setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")); }} /></label>
          <label className="crew-lounge-field"><span>Room address</span><input required maxLength={64} value={slug} placeholder="friday-event-room" onChange={(event) => setSlug(event.target.value)} /><small>Letters, numbers and hyphens only.</small></label>
          <label className="crew-lounge-field"><span>Welcome note</span><textarea rows={3} maxLength={240} value={description} placeholder="Talk through the evening’s flight, route or briefing." onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="crew-lounge-field"><span>Linked BAV calendar event <em>optional</em></span><select value={eventId} onChange={(event) => setEventId(event.target.value)}><option value="">Independent crew room</option>{publishedEvents.map((event) => <option key={event.id} value={event.id}>{event.date} · {event.title} · {event.route}</option>)}</select></label>
          <label className="crew-lounge-field"><span>Pilot in command <em>optional</em></span><select value={briefingPicPilotId} onChange={(event) => setBriefingPicPilotId(event.target.value)}><option value="">No shared booking</option>{pilots.map((pilot) => <option key={pilot.id} value={pilot.id}>{pilot.pilotNumber} · {pilot.name}</option>)}</select><small>The PIC can publish their own active booking; it is never copied to other pilots.</small></label>
          <div className="voice-room-time-grid"><label className="crew-lounge-field"><span>Opens <em>optional</em></span><input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label className="crew-lounge-field"><span>Closes <em>optional</em></span><input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label></div>
          <label className="crew-lounge-field"><span>Visibility</span><select value={status} onChange={(event) => setStatus(event.target.value as VoiceRoomStatus)}><option value="scheduled">Scheduled — shown as upcoming</option><option value="open">Open now — pilots can join</option><option value="closed">Closed — kept for staff history only</option></select></label>
          <footer><span role="status">{message}</span><button className="staff-primary-button" disabled={busy} type="submit">{busy ? "Saving…" : "Create voice room"}</button></footer>
        </form>
        <section className="voice-room-list-card"><div className="voice-room-list-head"><div><span className="staff-kicker">Room board</span><h2>Current crew spaces</h2></div><span>{rooms.filter((room) => room.status === "open").length} open</span></div>
          {rooms.length ? <div className="voice-room-list">{rooms.map((room) => <article key={room.id}><div><span className={`voice-room-status ${room.status}`}>{roomBadge(room.status)}</span><strong>{room.name}</strong><p>{room.description}</p><small>{localTime(room.startsAt)}{room.eventId ? " · linked BAV event" : ""}</small></div><div className="voice-room-actions"><label><span>Briefing PIC</span><select value={roomPicSelections[room.id] ?? ""} onChange={(event) => setRoomPicSelections((current) => ({ ...current, [room.id]: event.target.value }))}><option value="">Choose pilot</option>{pilots.map((pilot) => <option key={pilot.id} value={pilot.id}>{pilot.pilotNumber} · {pilot.name}</option>)}</select></label><button type="button" disabled={busy || !roomPicSelections[room.id]} onClick={() => void assignPic(room.id)}>Set PIC</button>{room.status !== "open" ? <button type="button" disabled={busy} onClick={() => void changeStatus(room.id, "open")}>Open now</button> : null}{room.status !== "scheduled" ? <button type="button" disabled={busy} onClick={() => void changeStatus(room.id, "scheduled")}>Schedule</button> : null}{room.status !== "closed" ? <button type="button" disabled={busy} onClick={() => void changeStatus(room.id, "closed")}>Close room</button> : null}</div></article>)}</div> : <div className="voice-room-empty"><strong>No voice rooms yet</strong><span>Create the first crew room on the left. Pilots will only see it once you open or schedule it.</span></div>}
        </section>
      </div>
      <aside className="voice-room-honesty"><strong>Pilot-friendly controls</strong><span>Joining begins muted. Camera and screen sharing stay off until the pilot chooses them. The embedded room adapts its camera grid as people enter or leave.</span></aside>
    </section>
  </main>;
}
