"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type VoiceRoom = { id: string; name: string; status: "scheduled" | "open" | "closed" };
type Pilot = { id: string; name: string; pilotNumber: string; profileImage: string | null };
type Participant = { sessionId: string; pilotId: string; pilotNumber: string; name: string; profileImage: string | null };
type Signal = { id: string; from: Participant; kind: "offer" | "answer" | "candidate"; payload: Record<string, unknown> };
type JoinReply = { session: Participant; token: string; participants: Participant[]; maxParticipants: number; iceServers: RTCIceServer[] };
type PollReply = { participants: Participant[]; signals: Signal[] };

type Connection = { peer: Participant; connection: RTCPeerConnection; pendingCandidates: RTCIceCandidateInit[] };
type Session = { id: string; token: string };

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BA";
}

function stop(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function StreamVideo({ stream, className, muted = false }: { stream: MediaStream; className?: string; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} className={className} autoPlay muted={muted} playsInline />;
}

function StreamAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function PeerVoiceCall({ room, pilot }: { room: VoiceRoom; pilot: Pilot }) {
  const [phase, setPhase] = useState<"idle" | "joining" | "connected" | "error">("idle");
  const [notice, setNotice] = useState("");
  const [muted, setMuted] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [waitingRoomCount, setWaitingRoomCount] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);

  const mounted = useRef(true);
  const sessionRef = useRef<Session | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const connectionsRef = useRef<Map<string, Connection>>(new Map());
  const pollingRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);

  const otherParticipants = useMemo(() => participants.filter((member) => member.pilotId !== pilot.id), [participants, pilot.id]);

  const request = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/crew-lounge/rooms/${room.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null) as { error?: string } | Record<string, unknown> | null;
    if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "The voice room could not complete that request.");
    return data as Record<string, unknown>;
  }, [room.id]);

  useEffect(() => {
    let active = true;
    const preview = async () => {
      try {
        const data = await request({ action: "preview" }) as { participantCount?: number };
        if (active && typeof data.participantCount === "number") setWaitingRoomCount(data.participantCount);
      } catch {
        // The room can still be joined; the count is only a friendly preview.
      }
    };
    void preview();
    const timer = window.setInterval(() => void preview(), 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [request]);

  const sendSignal = useCallback(async (targetSessionId: string, kind: Signal["kind"], payload: Record<string, unknown>) => {
    const session = sessionRef.current;
    if (!session) return;
    await request({ action: "signal", sessionId: session.id, token: session.token, targetSessionId, kind, payload });
  }, [request]);

  const refreshRemoteStream = useCallback((sessionId: string, stream: MediaStream) => {
    if (mounted.current) setRemoteStreams((current) => ({ ...current, [sessionId]: stream }));
  }, []);

  const sendOffer = useCallback(async (entry: Connection) => {
    if (entry.connection.signalingState !== "stable") return;
    const offer = await entry.connection.createOffer();
    await entry.connection.setLocalDescription(offer);
    if (entry.connection.localDescription) {
      await sendSignal(entry.peer.sessionId, "offer", { description: { type: entry.connection.localDescription.type, sdp: entry.connection.localDescription.sdp } });
    }
  }, [sendSignal]);

  const ensureConnection = useCallback((peer: Participant) => {
    const existing = connectionsRef.current.get(peer.sessionId);
    if (existing) return existing;
    const connection = new RTCPeerConnection({ iceServers: iceServersRef.current });
    const entry: Connection = { peer, connection, pendingCandidates: [] };
    const microphone = microphoneStreamRef.current;
    if (microphone) microphone.getTracks().forEach((track) => connection.addTrack(track, microphone));
    const activeVideo = screenStreamRef.current ?? cameraStreamRef.current;
    if (activeVideo) activeVideo.getVideoTracks().forEach((track) => connection.addTrack(track, activeVideo));
    connection.onicecandidate = (event) => {
      if (event.candidate) void sendSignal(peer.sessionId, "candidate", { candidate: event.candidate.toJSON() }).catch(() => undefined);
    };
    connection.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      event.track.addEventListener("mute", () => refreshRemoteStream(peer.sessionId, stream));
      event.track.addEventListener("unmute", () => refreshRemoteStream(peer.sessionId, stream));
      event.track.addEventListener("ended", () => refreshRemoteStream(peer.sessionId, stream));
      refreshRemoteStream(peer.sessionId, stream);
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed" || connection.connectionState === "closed") {
        connectionsRef.current.delete(peer.sessionId);
        if (mounted.current) setRemoteStreams((current) => { const next = { ...current }; delete next[peer.sessionId]; return next; });
        if (connection.connectionState === "failed" && mounted.current) setNotice("A direct connection could not be completed on this network. The room chat is still available; you can retry voice.");
      }
    };
    connectionsRef.current.set(peer.sessionId, entry);
    return entry;
  }, [refreshRemoteStream, sendSignal]);

  const negotiateVideo = useCallback(async (track: MediaStreamTrack | null, stream: MediaStream | null) => {
    for (const entry of connectionsRef.current.values()) {
      const sender = entry.connection.getSenders().find((candidate) => candidate.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      else if (track && stream) entry.connection.addTrack(track, stream);
      await sendOffer(entry);
    }
  }, [sendOffer]);

  const processSignal = useCallback(async (signal: Signal) => {
    const entry = ensureConnection(signal.from);
    if (signal.kind === "candidate") {
      const candidate = jsonObject(signal.payload.candidate);
      if (!candidate) return;
      if (entry.connection.remoteDescription) await entry.connection.addIceCandidate(candidate as RTCIceCandidateInit).catch(() => undefined);
      else entry.pendingCandidates.push(candidate as RTCIceCandidateInit);
      return;
    }
    const description = jsonObject(signal.payload.description);
    if (!description || (description.type !== "offer" && description.type !== "answer") || typeof description.sdp !== "string") return;
    if (signal.kind === "offer") {
      if (entry.connection.signalingState !== "stable") return;
      await entry.connection.setRemoteDescription(description as unknown as RTCSessionDescriptionInit);
      for (const candidate of entry.pendingCandidates.splice(0)) await entry.connection.addIceCandidate(candidate).catch(() => undefined);
      const answer = await entry.connection.createAnswer();
      await entry.connection.setLocalDescription(answer);
      if (entry.connection.localDescription) await sendSignal(entry.peer.sessionId, "answer", { description: { type: entry.connection.localDescription.type, sdp: entry.connection.localDescription.sdp } });
      return;
    }
    if (entry.connection.signalingState === "have-local-offer") {
      await entry.connection.setRemoteDescription(description as unknown as RTCSessionDescriptionInit);
      for (const candidate of entry.pendingCandidates.splice(0)) await entry.connection.addIceCandidate(candidate).catch(() => undefined);
    }
  }, [ensureConnection, sendSignal]);

  const synchroniseParticipants = useCallback(async (next: Participant[]) => {
    if (!mounted.current) return;
    setParticipants(next);
    const ours = sessionRef.current?.id;
    if (!ours) return;
    const available = new Set(next.map((member) => member.sessionId));
    for (const [peerId, entry] of connectionsRef.current) {
      if (!available.has(peerId)) {
        entry.connection.close();
        connectionsRef.current.delete(peerId);
        setRemoteStreams((current) => { const updated = { ...current }; delete updated[peerId]; return updated; });
      }
    }
    for (const peer of next) {
      if (peer.sessionId === ours || connectionsRef.current.has(peer.sessionId)) continue;
      // A deterministic initiator avoids two pilots creating offers at once.
      if (ours > peer.sessionId) await sendOffer(ensureConnection(peer));
    }
  }, [ensureConnection, sendOffer]);

  const poll = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const reply = await request({ action: "poll", sessionId: session.id, token: session.token }) as PollReply;
      for (const signal of reply.signals ?? []) await processSignal(signal);
      await synchroniseParticipants(reply.participants ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The direct call lost its connection.";
      if (mounted.current) setNotice(message);
    } finally {
      pollingRef.current = false;
    }
  }, [processSignal, request, synchroniseParticipants]);

  const closeConnections = useCallback(() => {
    for (const entry of connectionsRef.current.values()) entry.connection.close();
    connectionsRef.current.clear();
    if (mounted.current) setRemoteStreams({});
  }, []);

  const leave = useCallback(async (quiet = false) => {
    if (pollTimerRef.current) { window.clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      void request({ action: "leave", sessionId: session.id, token: session.token }).catch(() => undefined);
    }
    closeConnections();
    stop(microphoneStreamRef.current); stop(cameraStreamRef.current); stop(screenStreamRef.current);
    microphoneStreamRef.current = null; cameraStreamRef.current = null; screenStreamRef.current = null;
    if (mounted.current) {
      setPreviewStream(null); setParticipants([]); setMuted(true); setCameraOn(false); setScreenOn(false);
      if (!quiet) { setPhase("idle"); setNotice(""); }
    }
  }, [closeConnections, request]);

  const join = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setPhase("error"); setNotice("This browser cannot make a direct voice call. Try the latest Safari, Chrome, Edge or Firefox."); return;
    }
    setPhase("joining"); setNotice("");
    try {
      // The request happens only after the pilot chooses Join voice. It begins muted.
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      microphone.getAudioTracks().forEach((track) => { track.enabled = false; });
      microphoneStreamRef.current = microphone;
      const reply = await request({ action: "join" }) as JoinReply;
      sessionRef.current = { id: reply.session.sessionId, token: reply.token };
      iceServersRef.current = reply.iceServers;
      await synchroniseParticipants(reply.participants);
      if (!mounted.current) return;
      setPhase("connected");
      pollTimerRef.current = window.setInterval(() => void poll(), 2_500);
      void poll();
    } catch (error) {
      stop(microphoneStreamRef.current); microphoneStreamRef.current = null;
      if (mounted.current) { setPhase("error"); setNotice(error instanceof Error ? error.message : "Your microphone could not be connected."); }
    }
  }, [poll, request, synchroniseParticipants]);

  const toggleMuted = useCallback(() => {
    const next = !muted;
    microphoneStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      const previous = cameraStreamRef.current;
      cameraStreamRef.current = null;
      stop(previous);
      if (!screenOn) {
        await negotiateVideo(null, null);
        setPreviewStream(null);
      }
      setCameraOn(false);
      return;
    }
    try {
      const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      cameraStreamRef.current = camera;
      if (!screenOn) {
        setPreviewStream(camera);
        await negotiateVideo(camera.getVideoTracks()[0] ?? null, camera);
      }
      setCameraOn(true);
    } catch {
      setNotice("Camera permission was not granted. Nothing has been shared.");
    }
  }, [cameraOn, negotiateVideo, screenOn]);

  const stopScreenShare = useCallback(async () => {
    const previous = screenStreamRef.current;
    screenStreamRef.current = null;
    stop(previous);
    const camera = cameraStreamRef.current;
    await negotiateVideo(camera?.getVideoTracks()[0] ?? null, camera ?? null);
    if (mounted.current) { setPreviewStream(camera); setScreenOn(false); }
  }, [negotiateVideo]);

  const toggleScreen = useCallback(async () => {
    if (screenOn) {
      await stopScreenShare();
      return;
    }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = screen.getVideoTracks()[0];
      if (!track) { stop(screen); return; }
      screenStreamRef.current = screen;
      track.addEventListener("ended", () => { void stopScreenShare(); }, { once: true });
      setPreviewStream(screen);
      await negotiateVideo(track, screen);
      setScreenOn(true);
    } catch {
      setNotice("Screen sharing was not started. Nothing has been shared.");
    }
  }, [negotiateVideo, screenOn, stopScreenShare]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; void leave(true); };
  }, [leave]);

  const memberCount = phase === "connected" ? participants.length : waitingRoomCount;
  const localMedia = previewStream && previewStream.getVideoTracks().some((track) => track.readyState === "live");

  return <section className="crew-p2p-call" aria-label="Private Crew Lounge voice room">
    <header className="crew-p2p-call-heading"><div><span className="crew-voice-eyebrow">Private direct call · beta</span><h3>{phase === "connected" ? "You are in the crew room" : "Join the crew voice room"}</h3></div><span className="crew-p2p-capacity">{memberCount}/4 pilots</span></header>
    {phase === "idle" || phase === "error" ? <div className="crew-p2p-intro"><p>Join muted, then decide whether to speak, turn on your camera, or share a screen. BAV does not record or retain your media.</p><button type="button" className="crew-voice-primary" onClick={() => void join()}>Join voice</button></div> : null}
    {phase === "joining" ? <div className="crew-p2p-intro"><span className="crew-p2p-spinner" aria-hidden="true" /><p>Asking your browser for microphone permission and preparing a direct connection…</p></div> : null}
    {phase === "connected" ? <>
      <div className={`crew-p2p-grid crew-p2p-grid-${Math.min(Math.max(memberCount, 1), 4)}`}>
        <article className="crew-p2p-tile crew-p2p-self">{localMedia && previewStream ? <StreamVideo stream={previewStream} className="crew-p2p-video" muted /> : <span className="crew-p2p-avatar">{pilot.profileImage ? <img src={pilot.profileImage} alt="" /> : initials(pilot.name)}</span>}<footer><strong>You</strong><span>{screenOn ? "Sharing screen" : cameraOn ? "Camera on" : muted ? "Muted" : "Speaking"}</span></footer></article>
        {otherParticipants.map((member) => {
          const stream = remoteStreams[member.sessionId];
          const video = Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live" && !track.muted));
          return <article className="crew-p2p-tile" key={member.sessionId}>{stream ? <StreamAudio stream={stream} /> : null}{stream && video ? <StreamVideo stream={stream} className="crew-p2p-video" muted /> : <span className="crew-p2p-avatar">{member.profileImage ? <img src={member.profileImage} alt="" /> : initials(member.name)}</span>}<footer><strong>{member.name}</strong><span>{video ? "Camera on" : stream ? "Listening" : "Connecting…"}</span></footer></article>;
        })}
      </div>
      <div className="crew-p2p-controls"><button type="button" className={muted ? "active" : ""} onClick={toggleMuted}>{muted ? "Unmute" : "Mute"}</button><button type="button" className={cameraOn ? "active" : ""} onClick={() => void toggleCamera()}>{cameraOn ? "Camera off" : "Camera"}</button><button type="button" className={screenOn ? "active" : ""} onClick={() => void toggleScreen()}>{screenOn ? "Stop share" : "Share screen"}</button><button type="button" className="leave" onClick={() => void leave()}>Leave voice</button></div>
      <p className="crew-p2p-privacy">Direct pilot-to-pilot media · no BAV recording · standard connection setup may use a public STUN service to find a route, but it never carries your call.</p>
    </> : null}
    {notice ? <div className="crew-p2p-notice" role="status"><p>{notice}</p>{phase === "connected" ? <button type="button" onClick={() => { void leave().then(() => join()); }}>Reconnect voice</button> : null}</div> : null}
  </section>;
}
