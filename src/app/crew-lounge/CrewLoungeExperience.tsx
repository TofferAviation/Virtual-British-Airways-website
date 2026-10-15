"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PeerVoiceCall } from "./PeerVoiceCall";

type VoiceRoomStatus = "scheduled" | "open" | "closed";
type VoiceRoom = { id: string; name: string; description: string; startsAt: string | null; endsAt: string | null; status: VoiceRoomStatus };
type Pilot = { id: string; name: string; pilotNumber: string; profileImage: string | null };
type ChatMessage = { id: string; pilotId: string; pilotNumber: string; pilotName: string; rank: string; body: string; createdAt: string };
type Portrait = { pilotId: string; profileImage: string | null };
type LoungeEvent = { id: string; title: string; typeLabel: string; date: string; startUtc: string; route: { from: string; to: string; fromName: string; toName: string }; participantCount: number };
type Props = { pilot: Pilot; initialRooms: VoiceRoom[]; initialEvents: LoungeEvent[]; canManageRooms: boolean };

const roomPatterns = { planning: /plan|route|brief/i, coffee: /coffee|casual|social|general|lounge/i };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BA";
}

function cleanImage(image: string | null | undefined) {
  return image && image.trim() ? image : null;
}

function roomTime(room: VoiceRoom) {
  if (!room.startsAt) return room.status === "open" ? "Open now" : "Waiting for the host";
  return `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(room.startsAt))} UTC`;
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function eventDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00Z`));
}

function statusCopy(status: VoiceRoomStatus) {
  return status === "open" ? "Open now" : status === "scheduled" ? "Coming up" : "Closed";
}

function LoungeIcon({ name }: { name: "rooms" | "plan" | "voice" | "coffee" | "people" | "event" | "chat" }) {
  const symbols = { rooms: "●●", plan: "◫", voice: "◖◗", coffee: "☕", people: "●●●", event: "✦", chat: "◌" };
  return <span className={`lounge-icon lounge-icon-${name}`} aria-hidden="true">{symbols[name]}</span>;
}

export function CrewLoungeExperience({ pilot, initialRooms, initialEvents, canManageRooms }: Props) {
  const firstRoom = initialRooms.find((room) => room.status === "open") ?? initialRooms[0] ?? null;
  const [rooms, setRooms] = useState(initialRooms);
  const [selectedRoomId, setSelectedRoomId] = useState(firstRoom?.id ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [portraits, setPortraits] = useState<Record<string, string | null>>({});
  const [chatStatus, setChatStatus] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const [roomBoardStatus, setRoomBoardStatus] = useState("");
  const [openingRoom, setOpeningRoom] = useState(false);

  const selectedRoom = useMemo(() => rooms.find((room) => room.id === selectedRoomId) ?? null, [rooms, selectedRoomId]);
  const roomIsOpen = selectedRoom?.status === "open";

  const applyRoomBoard = useCallback((nextRooms: VoiceRoom[]) => {
    setRooms(nextRooms);
    setSelectedRoomId((current) => nextRooms.some((room) => room.id === current) ? current : (nextRooms.find((room) => room.status === "open")?.id ?? nextRooms[0]?.id ?? ""));
  }, []);

  const refreshRoomBoard = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshingRooms(true);
    try {
      const response = await fetch("/api/crew-lounge/rooms", { cache: "no-store" });
      const data = await response.json().catch(() => null) as { error?: string; rooms?: VoiceRoom[] } | null;
      if (!response.ok || !Array.isArray(data?.rooms)) throw new Error(data?.error || "The crew-room board could not be refreshed.");
      applyRoomBoard(data.rooms);
      if (!quiet) setRoomBoardStatus("The room board is up to date.");
    } catch (error) {
      if (!quiet) setRoomBoardStatus(error instanceof Error ? error.message : "The crew-room board could not be refreshed.");
    } finally {
      if (!quiet) setRefreshingRooms(false);
    }
  }, [applyRoomBoard]);

  useEffect(() => {
    void refreshRoomBoard(true);
    const timer = window.setInterval(() => void refreshRoomBoard(true), 15_000);
    return () => window.clearInterval(timer);
  }, [refreshRoomBoard]);

  useEffect(() => {
    if (!selectedRoom || !roomIsOpen) {
      setMessages([]);
      setPortraits({});
      setChatStatus("");
      return;
    }
    let live = true;
    const load = async () => {
      try {
        const response = await fetch(`/api/crew-lounge/rooms/${selectedRoom.id}/messages?limit=60`, { cache: "no-store" });
        const data = await response.json().catch(() => null) as { error?: string; messages?: ChatMessage[]; portraits?: Portrait[] } | null;
        if (!live) return;
        if (!response.ok) throw new Error(data?.error || "The crew conversation is unavailable.");
        setMessages(data?.messages ?? []);
        setPortraits(Object.fromEntries((data?.portraits ?? []).map((portrait) => [portrait.pilotId, portrait.profileImage])));
        setChatStatus("");
      } catch (error) {
        if (live) setChatStatus(error instanceof Error ? error.message : "The crew conversation is unavailable.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => { live = false; window.clearInterval(timer); };
  }, [selectedRoom?.id, selectedRoom, roomIsOpen]);

  async function openSelectedRoom() {
    if (!selectedRoom || !canManageRooms) return;
    setOpeningRoom(true);
    setRoomBoardStatus("");
    try {
      const response = await fetch("/api/staff/voice-rooms", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selectedRoom.id, status: "open" }) });
      const data = await response.json().catch(() => null) as { error?: string; room?: VoiceRoom } | null;
      if (!response.ok || !data?.room) throw new Error(data?.error || "The room could not be opened.");
      applyRoomBoard(rooms.map((room) => room.id === data.room!.id ? data.room! : room));
      setRoomBoardStatus(`“${data.room.name}” is open. Pilots can join voice and chat now.`);
    } catch (error) {
      setRoomBoardStatus(error instanceof Error ? error.message : "The room could not be opened.");
    } finally {
      setOpeningRoom(false);
    }
  }

  async function submitMessage() {
    if (!selectedRoom || !roomIsOpen || !draft.trim()) return;
    setSending(true);
    setChatStatus("");
    try {
      const response = await fetch(`/api/crew-lounge/rooms/${selectedRoom.id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: draft }) });
      const data = await response.json().catch(() => null) as { error?: string; message?: ChatMessage } | null;
      if (!response.ok || !data?.message) throw new Error(data?.error || "Your message could not be sent.");
      setMessages((current) => [...current, data.message!]);
      setPortraits((current) => ({ ...current, [pilot.id]: pilot.profileImage }));
      setDraft("");
    } catch (error) {
      setChatStatus(error instanceof Error ? error.message : "Your message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    void submitMessage();
  }

  function chooseRoom(pattern: RegExp, unavailableMessage: string) {
    const room = rooms.find((item) => pattern.test(item.name) || pattern.test(item.description));
    if (!room) {
      setRoomBoardStatus(unavailableMessage);
      return;
    }
    setSelectedRoomId(room.id);
    window.requestAnimationFrame(() => document.getElementById("lounge-active-room")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return <main className="crew-voice-page crew-lounge-reference-page">
    <section className="crew-lounge-reference-hero">
      <div className="crew-lounge-reference-shell crew-lounge-reference-hero-copy">
        <span className="crew-voice-eyebrow">British Airways Virtual community</span>
        <h1>The Crew Lounge</h1>
        <h2>Same skies. A warmer welcome.</h2>
        <p>Relax, plan a flight, meet the people behind the callsigns and enjoy great company — before, during or after your journey.</p>
        <em>More than flights. A community.</em>
      </div>
    </section>

    <nav className="crew-lounge-feature-strip crew-lounge-reference-shell" aria-label="Crew Lounge shortcuts">
      <button type="button" onClick={() => document.getElementById("crew-spaces")?.scrollIntoView({ behavior: "smooth", block: "start" })}><LoungeIcon name="rooms" /><span><strong>Crew Rooms</strong><small>Jump into a room and meet fellow pilots and crew.</small></span><b aria-hidden="true">›</b></button>
      <button type="button" onClick={() => chooseRoom(roomPatterns.planning, "No planning room is on the board right now. Browse the published events below.")}><LoungeIcon name="plan" /><span><strong>Planning Sessions</strong><small>Plan flights, share routes and get advice.</small></span><b aria-hidden="true">›</b></button>
      <button type="button" onClick={() => document.getElementById("lounge-active-room")?.scrollIntoView({ behavior: "smooth", block: "start" })}><LoungeIcon name="voice" /><span><strong>Voice Hangouts</strong><small>Casual chats, debriefs and social flying.</small></span><b aria-hidden="true">›</b></button>
      <button type="button" onClick={() => chooseRoom(roomPatterns.coffee, "A casual coffee room has not been scheduled yet.")}><LoungeIcon name="coffee" /><span><strong>Coffee Chat</strong><small>Sometimes the best flights start with a chat.</small></span><b aria-hidden="true">›</b></button>
      <a href="/events"><LoungeIcon name="people" /><span><strong>A Stronger Community</strong><small>Real people. Shared passion. Always a place to belong.</small></span><b aria-hidden="true">›</b></a>
    </nav>

    <section className="crew-lounge-reference-shell crew-lounge-reference-layout" aria-label="Crew Lounge">
      <aside className="crew-lounge-rooms-card" id="crew-spaces" aria-label="Crew rooms">
        <header><span className="crew-voice-eyebrow">Crew spaces</span><h2>Find a seat</h2></header>
        <div className="crew-lounge-room-list">
          {rooms.length ? rooms.map((room) => <button key={room.id} className={room.id === selectedRoomId ? "selected" : ""} type="button" onClick={() => setSelectedRoomId(room.id)}><span className={`crew-lounge-room-dot ${room.status}`} aria-hidden="true" /><span><strong>{room.name}</strong><small>{room.status === "open" ? "Open for crew" : roomTime(room)}</small></span><em>{room.id === selectedRoomId ? "›" : ""}</em></button>) : <div className="crew-lounge-list-empty"><strong>No rooms are on the board yet</strong><span>Staff will add the next place to meet here.</span></div>}
        </div>
        <footer><a href="/events">View BAV events <span aria-hidden="true">›</span></a><button type="button" onClick={() => void refreshRoomBoard()} disabled={refreshingRooms}>{refreshingRooms ? "Refreshing…" : "Refresh rooms"}</button></footer>
        {roomBoardStatus ? <p className="crew-lounge-room-status" role="status">{roomBoardStatus}</p> : null}
      </aside>

      <section className="crew-lounge-main-column" id="lounge-active-room">
        {selectedRoom ? <>
          <section className="crew-lounge-active-room">
            <header className="crew-lounge-active-heading"><div><span className={`crew-lounge-status-chip ${selectedRoom.status}`}>{statusCopy(selectedRoom.status)}</span><h2>{selectedRoom.name}</h2><p>{selectedRoom.description}</p></div><div className="crew-lounge-active-meta"><span>{roomTime(selectedRoom)}</span>{selectedRoom.endsAt ? <small>Ends {new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(selectedRoom.endsAt))} UTC</small> : null}</div></header>
            {roomIsOpen ? <PeerVoiceCall key={selectedRoom.id} room={selectedRoom} pilot={pilot} /> : <section className="crew-lounge-waiting-stage" aria-label="Voice room availability"><LoungeIcon name="voice" /><div><span className="crew-voice-eyebrow">{selectedRoom.status === "closed" ? "Room closed" : "Waiting for the host"}</span><h3>{selectedRoom.status === "closed" ? "This room has wrapped up" : "This room is on the departure board"}</h3><p>{selectedRoom.status === "closed" ? "Choose another crew space to see what is open now." : "Voice and chat unlock as soon as a staff host opens this room. This board checks for updates every 15 seconds."}</p>{selectedRoom.status !== "closed" ? <div>{canManageRooms ? <><button type="button" onClick={() => void openSelectedRoom()} disabled={openingRoom}>{openingRoom ? "Opening room…" : "Open room now"}</button><a href="/staff/voice-rooms">Manage rooms</a></> : <button type="button" onClick={() => void refreshRoomBoard()} disabled={refreshingRooms}>{refreshingRooms ? "Checking…" : "Check again"}</button>}</div> : null}</div></section>}
          </section>
          <section className="crew-lounge-chat" aria-labelledby="crew-lounge-chat-title">
            <header><div><span className="crew-voice-eyebrow">Room chat</span><h2 id="crew-lounge-chat-title">The crew chat</h2></div><span>Text stays separate from voice · last 14 days</span></header>
            <div className="crew-lounge-messages" aria-live="polite">
              {messages.length ? messages.map((message) => { const image = cleanImage(portraits[message.pilotId]); return <article key={message.id} className={message.pilotId === pilot.id ? "mine" : ""}>{image ? <img src={image} alt="" /> : <span className="crew-lounge-message-avatar">{initials(message.pilotName)}</span>}<div><header><strong>{message.pilotName}</strong><span>{message.rank} · {messageTime(message.createdAt)}</span></header><p>{message.body}</p></div></article>; }) : <div className="crew-lounge-chat-empty"><LoungeIcon name="chat" /><strong>The table is quiet for now</strong><span>Be the first to welcome another pilot into this room.</span></div>}
            </div>
            {roomIsOpen ? <form onSubmit={sendMessage} className="crew-lounge-message-form"><input id="crew-lounge-draft" aria-label={`Message ${selectedRoom.name}`} value={draft} maxLength={600} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !sending && draft.trim()) { event.preventDefault(); void submitMessage(); } }} placeholder={`Share a message with ${selectedRoom.name} · press Enter to send`} /><span>Press Enter to send</span></form> : <div className="crew-lounge-chat-closed">This conversation opens with the crew room.</div>}
            {chatStatus ? <p className="crew-lounge-chat-status" role="status">{chatStatus}</p> : null}
          </section>
        </> : <section className="crew-lounge-no-room"><span className="crew-voice-eyebrow">Crew Lounge</span><h2>A room is waiting to be planned</h2><p>When staff open a community room, it will appear on this board. In the meantime, the events page is the best place to see what is coming up.</p><a href="/events">View BAV events</a></section>}
      </section>

      <aside className="crew-lounge-side-column">
        <section className="crew-lounge-profile-card"><span className="crew-voice-eyebrow">Your crew profile</span><div className="crew-lounge-profile-identity">{cleanImage(pilot.profileImage) ? <img src={pilot.profileImage!} alt="" /> : <span>{initials(pilot.name)}</span>}<div><strong>{pilot.name}</strong><small>Pilot {pilot.pilotNumber}</small></div></div><p>Your microphone, camera and screen stay off until you choose to share them.</p><a href="/account/profile">View your profile <span aria-hidden="true">›</span></a></section>
        <section className="crew-lounge-events-card"><header><span className="crew-voice-eyebrow">Upcoming together</span><h2>Where we are flying</h2></header>{initialEvents.length ? <div className="crew-lounge-event-list">{initialEvents.map((event) => <article key={event.id}><LoungeIcon name="event" /><div><strong>{event.title}</strong><span>{event.route.from} → {event.route.to} · {event.typeLabel}</span><small>{event.participantCount > 0 ? `${event.participantCount} pilots planning to fly` : "Open for pilots"}</small></div><time dateTime={event.date}>{eventDate(event.date)}<small>{event.startUtc}Z</small></time></article>)}</div> : <p className="crew-lounge-events-empty">The next published community event will appear here.</p>}<a href="/events">View all events <span aria-hidden="true">›</span></a></section>
        <section className="crew-lounge-coffee-card"><div><LoungeIcon name="coffee" /><strong>Great conversations<br />fuel great flights.</strong></div></section>
      </aside>
    </section>
  </main>;
}
