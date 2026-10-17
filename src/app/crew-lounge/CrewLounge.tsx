"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PeerVoiceCall } from "./PeerVoiceCall";

type VoiceRoomStatus = "scheduled" | "open" | "closed";
type VoiceRoom = { id: string; name: string; description: string; startsAt: string | null; endsAt: string | null; status: VoiceRoomStatus; maxParticipants: number };
type Pilot = { id: string; name: string; pilotNumber: string; profileImage: string | null };
type ChatMessage = { id: string; pilotId: string; pilotNumber: string; pilotName: string; rank: string; body: string; createdAt: string };
type Portrait = { pilotId: string; profileImage: string | null };
type Props = { pilot: Pilot; initialRooms: VoiceRoom[]; canManageRooms: boolean };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BA";
}

function roomTime(room: VoiceRoom) {
  if (!room.startsAt) return room.status === "open" ? "Open now" : "Waiting for the host";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(room.startsAt)) + " UTC";
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function profileImage(image: string | null | undefined) {
  return image && image.trim() ? image : null;
}

export function CrewLounge({ pilot, initialRooms, canManageRooms }: Props) {
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
    setSelectedRoomId((current) => {
      if (nextRooms.some((room) => room.id === current)) return current;
      return nextRooms.find((room) => room.status === "open")?.id ?? nextRooms[0]?.id ?? "";
    });
  }, []);

  const refreshRoomBoard = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshingRooms(true);
    try {
      const response = await fetch("/api/crew-lounge/rooms", { cache: "no-store" });
      const data = await response.json().catch(() => null) as { error?: string; rooms?: VoiceRoom[] } | null;
      if (!response.ok || !Array.isArray(data?.rooms)) throw new Error(data?.error || "The crew-room board could not be refreshed.");
      applyRoomBoard(data.rooms);
      if (!quiet) setRoomBoardStatus("The crew-room board is up to date.");
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

  async function openSelectedRoom() {
    if (!selectedRoom || !canManageRooms) return;
    setOpeningRoom(true);
    setRoomBoardStatus("");
    try {
      const response = await fetch("/api/staff/voice-rooms", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selectedRoom.id, status: "open" }),
      });
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
    const timer = window.setInterval(() => void load(), 30000);
    return () => { live = false; window.clearInterval(timer); };
  }, [selectedRoom?.id, roomIsOpen, selectedRoom]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!selectedRoom || !roomIsOpen || !draft.trim()) return;
    setSending(true); setChatStatus("");
    try {
      const response = await fetch(`/api/crew-lounge/rooms/${selectedRoom.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
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

  return (
    <main className="crew-voice-page">
      <section className="crew-voice-hero">
        <div className="crew-voice-shell crew-voice-hero-inner">
          <div>
            <span className="crew-voice-eyebrow">British Airways Virtual community</span>
            <h1>Welcome to the Crew Lounge</h1>
            <p>A calmer place to plan a flight, meet the people behind the callsigns and settle in before departure.</p>
          </div>
          <aside className="crew-voice-privacy-card">
            <span className="crew-voice-live-dot" aria-hidden="true" />
            <strong>Private pilot-to-pilot voice beta</strong>
            <p>Rooms are run by BAV staff. Audio, camera and screen sharing are opt-in and are never recorded by BAV.</p>
          </aside>
        </div>
      </section>

      <section className="crew-voice-shell crew-voice-layout" aria-label="Crew Lounge">
        <aside className="crew-voice-rail" aria-label="Crew rooms">
          <div className="crew-voice-rail-heading"><span className="crew-voice-eyebrow">Crew spaces</span><h2>Find a seat</h2></div>
          <div className="crew-voice-room-list">
            {rooms.length ? rooms.map((room) => (
              <button key={room.id} className={room.id === selectedRoomId ? "selected" : ""} type="button" onClick={() => setSelectedRoomId(room.id)}>
                <span className={`crew-voice-room-indicator ${room.status}`} aria-hidden="true" />
                <span><b>{room.name}</b><small>{room.status === "open" ? "Open for crew" : roomTime(room)}</small></span>
              </button>
            )) : <div className="crew-voice-empty-rail"><strong>No rooms on the board yet</strong><span>Staff will add the next crew space here.</span></div>}
          </div>
          <div className="crew-voice-rail-note"><span>✦</span><p><strong>New to BAV?</strong> You can drop into an open room, listen first and decide what to share. There is never pressure to turn on your camera.</p><button type="button" className="crew-voice-refresh-button" onClick={() => void refreshRoomBoard()} disabled={refreshingRooms}>{refreshingRooms ? "Refreshing…" : "Refresh rooms"}</button></div>
        </aside>

        <section className="crew-voice-main-panel">
          {selectedRoom ? <>
            <header className="crew-voice-room-header">
              <div><span className={`crew-voice-status ${selectedRoom.status}`}>{selectedRoom.status === "open" ? "Open crew space" : "Upcoming crew space"}</span><h2>{selectedRoom.name}</h2><p>{selectedRoom.description}</p></div>
              <div className="crew-voice-room-time"><span>{roomTime(selectedRoom)}</span>{selectedRoom.endsAt ? <small>Ends {new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(selectedRoom.endsAt))} UTC</small> : null}</div>
            </header>
            {roomIsOpen ? <PeerVoiceCall key={selectedRoom.id} room={selectedRoom} pilot={pilot} /> : <section className="crew-voice-stage" aria-label="Voice room availability"><div className="crew-voice-stage-copy"><span className="crew-voice-eyebrow">Room status</span><h3>This room is waiting for its host</h3><p>Voice and chat unlock the moment a staff host opens this room. You can keep this page open: the board checks for changes about every 15 seconds.</p><div className="crew-voice-stage-actions">{canManageRooms ? <><button type="button" className="crew-voice-primary" onClick={() => void openSelectedRoom()} disabled={openingRoom}>{openingRoom ? "Opening room…" : "Open room now"}</button><a href="/staff/voice-rooms">Manage crew rooms</a></> : <button type="button" className="crew-voice-secondary" onClick={() => void refreshRoomBoard()} disabled={refreshingRooms}>{refreshingRooms ? "Checking…" : "Check if room is open"}</button>}</div>{roomBoardStatus ? <p className="crew-voice-room-board-status" role="status">{roomBoardStatus}</p> : null}</div></section>}
            <section className="crew-voice-chat" aria-labelledby="crew-voice-chat-title">
              <header><div><span className="crew-voice-eyebrow">Room conversation</span><h3 id="crew-voice-chat-title">The crew chat</h3></div><span>Text is separate from voice · last 14 days shown</span></header>
              <div className="crew-voice-messages">
                {messages.length ? messages.map((message) => {
                  const image = profileImage(portraits[message.pilotId]);
                  return <article key={message.id} className={message.pilotId === pilot.id ? "mine" : ""}>
                    {image ? <img src={image} alt="" /> : <span className="crew-voice-message-avatar">{initials(message.pilotName)}</span>}
                    <div><header><strong>{message.pilotName}</strong><span>{message.rank} · {messageTime(message.createdAt)}</span></header><p>{message.body}</p></div>
                  </article>;
                }) : <div className="crew-voice-chat-empty"><strong>The table is quiet for now</strong><span>Be the first to welcome another pilot into this room.</span></div>}
              </div>
              {roomIsOpen ? <form onSubmit={sendMessage} className="crew-voice-message-form"><label className="sr-only" htmlFor="crew-voice-draft">Message {selectedRoom.name}</label><input id="crew-voice-draft" value={draft} maxLength={600} onChange={(event) => setDraft(event.target.value)} placeholder={`Say hello in ${selectedRoom.name}`} /><button type="submit" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</button></form> : <div className="crew-voice-chat-closed">This conversation opens with the crew room.</div>}
              {chatStatus ? <p className="crew-voice-chat-status" role="status">{chatStatus}</p> : null}
            </section>
          </> : <section className="crew-voice-no-room"><span className="crew-voice-eyebrow">Crew Lounge</span><h2>A room is waiting to be planned</h2><p>When staff open a community room, it will appear on this board. In the meantime, the events page is the best place to see what is coming up.</p><a href="/events">View BAV events</a></section>}
        </section>

        <aside className="crew-voice-right-rail">
          <section className="crew-voice-pilot-card">
            <span className="crew-voice-eyebrow">Your flight jacket</span>
            <div>{profileImage(pilot.profileImage) ? <img src={pilot.profileImage!} alt="" /> : <span className="crew-voice-pilot-avatar">{initials(pilot.name)}</span>}<span><strong>{pilot.name}</strong><small>Pilot {pilot.pilotNumber}</small></span></div>
            <p>You are welcome to listen first. Your camera, microphone and screen are always opt-in.</p>
          </section>
          <section className="crew-voice-guide-card"><span className="crew-voice-eyebrow">How BAV voice works</span><ol><li><b>Choose an open crew room</b><span>Staff set up spaces around events, planning and social flying.</span></li><li><b>Decide what to share</b><span>Start muted; turn on your microphone, camera or screen only when you choose.</span></li><li><b>Fly together</b><span>Small rooms connect pilots directly and reshape the view as people join, without changing your flight tools.</span></li></ol></section>
          <section className="crew-voice-host-note"><span>✦</span><p><strong>Privacy by design</strong> BAV will not record or retain your camera, microphone or shared screen. Device checks run only in this browser tab.</p></section>
        </aside>
      </section>
    </main>
  );
}
