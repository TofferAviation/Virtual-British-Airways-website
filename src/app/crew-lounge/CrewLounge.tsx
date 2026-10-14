"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type VoiceRoomStatus = "scheduled" | "open" | "closed";
type VoiceRoom = { id: string; name: string; description: string; startsAt: string | null; endsAt: string | null; status: VoiceRoomStatus };
type Pilot = { id: string; name: string; pilotNumber: string; profileImage: string | null };
type ChatMessage = { id: string; pilotId: string; pilotNumber: string; pilotName: string; rank: string; body: string; createdAt: string };
type Portrait = { pilotId: string; profileImage: string | null };
type Props = { pilot: Pilot; initialRooms: VoiceRoom[] };

type PermissionState = "idle" | "checking" | "ready" | "blocked" | "unsupported";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BA";
}

function roomTime(room: VoiceRoom) {
  if (!room.startsAt) return room.status === "open" ? "Open now" : "Schedule to be confirmed";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(room.startsAt)) + " UTC";
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function profileImage(image: string | null | undefined) {
  return image && image.trim() ? image : null;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function CrewLounge({ pilot, initialRooms }: Props) {
  const firstRoom = initialRooms.find((room) => room.status === "open") ?? initialRooms[0] ?? null;
  const [selectedRoomId, setSelectedRoomId] = useState(firstRoom?.id ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [portraits, setPortraits] = useState<Record<string, string | null>>({});
  const [chatStatus, setChatStatus] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [microphone, setMicrophone] = useState<PermissionState>("idle");
  const [camera, setCamera] = useState<PermissionState>("idle");
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const selectedRoom = useMemo(() => initialRooms.find((room) => room.id === selectedRoomId) ?? null, [initialRooms, selectedRoomId]);
  const roomIsOpen = selectedRoom?.status === "open";

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = cameraStream;
  }, [cameraStream]);

  useEffect(() => () => stopStream(cameraStream), [cameraStream]);

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

  async function checkMicrophone() {
    if (!navigator.mediaDevices?.getUserMedia) { setMicrophone("unsupported"); return; }
    setMicrophone("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stopStream(stream);
      setMicrophone("ready");
    } catch {
      setMicrophone("blocked");
    }
  }

  async function toggleCameraPreview() {
    if (cameraStream) {
      stopStream(cameraStream); setCameraStream(null); setCamera("idle"); return;
    }
    if (!navigator.mediaDevices?.getUserMedia) { setCamera("unsupported"); return; }
    setCamera("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      setCameraStream(stream); setCamera("ready");
    } catch {
      setCamera("blocked");
    }
  }

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
            <strong>BAV voice service, safely in preparation</strong>
            <p>Rooms are run by BAV staff. Camera and microphone tests stay in your browser and are never recorded by BAV.</p>
          </aside>
        </div>
      </section>

      <section className="crew-voice-shell crew-voice-layout" aria-label="Crew Lounge">
        <aside className="crew-voice-rail" aria-label="Crew rooms">
          <div className="crew-voice-rail-heading"><span className="crew-voice-eyebrow">Crew spaces</span><h2>Find a seat</h2></div>
          <div className="crew-voice-room-list">
            {initialRooms.length ? initialRooms.map((room) => (
              <button key={room.id} className={room.id === selectedRoomId ? "selected" : ""} type="button" onClick={() => setSelectedRoomId(room.id)}>
                <span className={`crew-voice-room-indicator ${room.status}`} aria-hidden="true" />
                <span><b>{room.name}</b><small>{room.status === "open" ? "Open for crew" : roomTime(room)}</small></span>
              </button>
            )) : <div className="crew-voice-empty-rail"><strong>No rooms on the board yet</strong><span>Staff will add the next crew space here.</span></div>}
          </div>
          <div className="crew-voice-rail-note"><span>✦</span><p><strong>New to BAV?</strong> You can drop into an open room when the voice service goes live. There is no pressure to turn on your camera.</p></div>
        </aside>

        <section className="crew-voice-main-panel">
          {selectedRoom ? <>
            <header className="crew-voice-room-header">
              <div><span className={`crew-voice-status ${selectedRoom.status}`}>{selectedRoom.status === "open" ? "Open crew space" : "Upcoming crew space"}</span><h2>{selectedRoom.name}</h2><p>{selectedRoom.description}</p></div>
              <div className="crew-voice-room-time"><span>{roomTime(selectedRoom)}</span>{selectedRoom.endsAt ? <small>Ends {new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(selectedRoom.endsAt))} UTC</small> : null}</div>
            </header>
            <section className="crew-voice-stage" aria-label="Voice room preflight">
              <div className="crew-voice-stage-copy">
                <span className="crew-voice-eyebrow">Your preflight</span>
                <h3>{roomIsOpen ? "Check in at your own pace" : "This room is on the departure board"}</h3>
                <p>{roomIsOpen ? "The private BAV call layer will be switched on after its hosted service and security checks are complete. You can test your devices here without joining a call or sending any media." : "Staff have scheduled this room. It will become available here once they open it."}</p>
                {roomIsOpen ? <div className="crew-voice-device-actions">
                  <button type="button" className="crew-voice-primary" onClick={() => void checkMicrophone()} disabled={microphone === "checking"}>{microphone === "checking" ? "Checking microphone…" : microphone === "ready" ? "Microphone checked" : "Check microphone"}</button>
                  <button type="button" className="crew-voice-secondary" onClick={() => void toggleCameraPreview()} disabled={camera === "checking"}>{camera === "checking" ? "Opening camera…" : cameraStream ? "Close camera preview" : "Try camera preview"}</button>
                </div> : null}
                {microphone === "blocked" || camera === "blocked" ? <p className="crew-voice-device-message">Your browser did not grant that permission. You can change it later in your browser settings—nothing has been sent to BAV.</p> : null}
                {microphone === "unsupported" || camera === "unsupported" ? <p className="crew-voice-device-message">This browser does not offer media permissions. Try the latest Safari, Chrome, Edge or Firefox.</p> : null}
              </div>
              <div className="crew-voice-preview-card">
                {cameraStream ? <video className="crew-voice-camera-preview" ref={videoRef} autoPlay muted playsInline aria-label="Your local camera preview" /> : <div className="crew-voice-preview-placeholder"><span aria-hidden="true">◌</span><strong>Camera stays off by default</strong><p>Only you can see a local preview. It closes when you leave this page.</p></div>}
                <footer><span className={microphone === "ready" ? "is-ready" : ""}>● Microphone {microphone === "ready" ? "ready" : "not connected"}</span><span className={cameraStream ? "is-ready" : ""}>● Camera {cameraStream ? "previewing locally" : "off"}</span></footer>
              </div>
            </section>
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
          <section className="crew-voice-guide-card"><span className="crew-voice-eyebrow">How BAV voice will work</span><ol><li><b>Choose an open crew room</b><span>Staff set up spaces around events, planning and social flying.</span></li><li><b>Decide what to share</b><span>Start muted; turn on your microphone, camera or screen only when you choose.</span></li><li><b>Fly together</b><span>The BAV-hosted call will reshape its layout as people join, without changing your flight tools.</span></li></ol></section>
          <section className="crew-voice-host-note"><span>✦</span><p><strong>Privacy by design</strong> BAV will not record or retain your camera, microphone or shared screen. Device checks run only in this browser tab.</p></section>
        </aside>
      </section>
    </main>
  );
}
