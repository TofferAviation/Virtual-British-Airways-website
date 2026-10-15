"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type VoiceRoom = { id: string; name: string; status: "scheduled" | "open" | "closed" };
export type VoicePilot = { id: string; name: string; pilotNumber: string; profileImage: string | null };
export type VoiceParticipant = { sessionId: string; pilotId: string; pilotNumber: string; name: string; profileImage: string | null };
type Signal = { id: string; from: VoiceParticipant; kind: "offer" | "answer" | "candidate"; payload: Record<string, unknown> };
type JoinReply = { session: VoiceParticipant; token: string; participants: VoiceParticipant[]; maxParticipants: number; iceServers: RTCIceServer[] };
type PollReply = { participants: VoiceParticipant[]; signals: Signal[] };
type Connection = { peer: VoiceParticipant; connection: RTCPeerConnection; pendingCandidates: RTCIceCandidateInit[] };
type Session = { id: string; token: string };
export type VoicePhase = "idle" | "joining" | "connected" | "error";

type CrewVoiceContextValue = {
  activeRoom: VoiceRoom | null;
  activePilot: VoicePilot | null;
  phase: VoicePhase;
  notice: string;
  muted: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  participants: VoiceParticipant[];
  waitingRoomCount: number;
  remoteStreams: Record<string, MediaStream>;
  previewStream: MediaStream | null;
  join: (room: VoiceRoom, pilot: VoicePilot) => Promise<void>;
  leave: () => Promise<void>;
  toggleMuted: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreen: () => Promise<void>;
  previewRoom: (room: VoiceRoom) => Promise<void>;
};

const CrewVoiceContext = createContext<CrewVoiceContextValue | null>(null);

function stop(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

export function CrewVoiceProvider({ children }: { children: ReactNode }) {
  const [activeRoom, setActiveRoom] = useState<VoiceRoom | null>(null);
  const [activePilot, setActivePilot] = useState<VoicePilot | null>(null);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [notice, setNotice] = useState("");
  const [muted, setMuted] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [waitingRoomCount, setWaitingRoomCount] = useState(0);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);

  const mounted = useRef(true);
  const activeRoomRef = useRef<VoiceRoom | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([]);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const connectionsRef = useRef<Map<string, Connection>>(new Map());
  const pollingRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);

  const request = useCallback(async (body: Record<string, unknown>) => {
    const room = activeRoomRef.current;
    if (!room) throw new Error("Choose an open crew room before joining voice.");
    const response = await fetch(`/api/crew-lounge/rooms/${room.id}`, {
      method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null) as { error?: string } | Record<string, unknown> | null;
    if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "The voice room could not complete that request.");
    return data as Record<string, unknown>;
  }, []);

  const previewRoom = useCallback(async (room: VoiceRoom) => {
    try {
      const response = await fetch(`/api/crew-lounge/rooms/${room.id}`, {
        method: "POST", headers: { "content-type": "application/json" }, cache: "no-store", body: JSON.stringify({ action: "preview" }),
      });
      const data = await response.json().catch(() => null) as { participantCount?: unknown } | null;
      if (response.ok && typeof data?.participantCount === "number" && mounted.current) setWaitingRoomCount(data.participantCount);
    } catch {
      // The count is only a friendly preview. Joining remains available.
    }
  }, []);

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
    if (entry.connection.localDescription) await sendSignal(entry.peer.sessionId, "offer", { description: { type: entry.connection.localDescription.type, sdp: entry.connection.localDescription.sdp } });
  }, [sendSignal]);

  const ensureConnection = useCallback((peer: VoiceParticipant) => {
    const existing = connectionsRef.current.get(peer.sessionId);
    if (existing) return existing;
    const connection = new RTCPeerConnection({ iceServers: iceServersRef.current });
    const entry: Connection = { peer, connection, pendingCandidates: [] };
    const microphone = microphoneStreamRef.current;
    if (microphone) microphone.getTracks().forEach((track) => connection.addTrack(track, microphone));
    const activeVideo = screenStreamRef.current ?? cameraStreamRef.current;
    if (activeVideo) activeVideo.getVideoTracks().forEach((track) => connection.addTrack(track, activeVideo));
    connection.onicecandidate = (event) => { if (event.candidate) void sendSignal(peer.sessionId, "candidate", { candidate: event.candidate.toJSON() }).catch(() => undefined); };
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
        if (connection.connectionState === "failed" && mounted.current) setNotice("Your voice connection could not be completed on this network. The room chat is still available; you can retry voice.");
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

  const synchroniseParticipants = useCallback(async (next: VoiceParticipant[]) => {
    if (!mounted.current) return;
    setParticipants(next);
    const ours = sessionRef.current?.id;
    if (!ours) return;
    const available = new Set(next.map((member) => member.sessionId));
    for (const [peerId, entry] of connectionsRef.current) {
      if (!available.has(peerId)) {
        entry.connection.close(); connectionsRef.current.delete(peerId);
        setRemoteStreams((current) => { const updated = { ...current }; delete updated[peerId]; return updated; });
      }
    }
    for (const peer of next) if (peer.sessionId !== ours && !connectionsRef.current.has(peer.sessionId) && ours > peer.sessionId) await sendOffer(ensureConnection(peer));
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
      if (mounted.current) setNotice(error instanceof Error ? error.message : "The voice call lost its connection.");
    } finally { pollingRef.current = false; }
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
    if (session) void request({ action: "leave", sessionId: session.id, token: session.token }).catch(() => undefined);
    closeConnections();
    stop(microphoneStreamRef.current); stop(cameraStreamRef.current); stop(screenStreamRef.current);
    microphoneStreamRef.current = null; cameraStreamRef.current = null; screenStreamRef.current = null;
    activeRoomRef.current = null;
    if (mounted.current) {
      setActiveRoom(null); setActivePilot(null); setPreviewStream(null); setParticipants([]); setMuted(true); setCameraOn(false); setScreenOn(false);
      if (!quiet) { setPhase("idle"); setNotice(""); }
    }
  }, [closeConnections, request]);

  const join = useCallback(async (room: VoiceRoom, pilot: VoicePilot) => {
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setPhase("error"); setNotice("This browser cannot make a direct voice call. Try the latest Safari, Chrome, Edge or Firefox."); return;
    }
    if (sessionRef.current && activeRoomRef.current?.id === room.id) return;
    if (sessionRef.current) await leave();
    activeRoomRef.current = room;
    setActiveRoom(room); setActivePilot(pilot); setPhase("joining"); setNotice("");
    try {
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
      if (mounted.current) setPhase("error");
      if (mounted.current) setNotice(error instanceof Error ? error.message : "Your microphone could not be connected.");
    }
  }, [leave, poll, request, synchroniseParticipants]);

  const toggleMuted = useCallback(() => {
    const next = !muted;
    microphoneStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }, [muted]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      const previous = cameraStreamRef.current; cameraStreamRef.current = null; stop(previous);
      if (!screenOn) { await negotiateVideo(null, null); setPreviewStream(null); }
      setCameraOn(false); return;
    }
    try {
      const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
      cameraStreamRef.current = camera;
      if (!screenOn) { setPreviewStream(camera); await negotiateVideo(camera.getVideoTracks()[0] ?? null, camera); }
      setCameraOn(true);
    } catch { setNotice("Camera permission was not granted. Nothing has been shared."); }
  }, [cameraOn, negotiateVideo, screenOn]);

  const stopScreenShare = useCallback(async () => {
    const previous = screenStreamRef.current; screenStreamRef.current = null; stop(previous);
    const camera = cameraStreamRef.current;
    await negotiateVideo(camera?.getVideoTracks()[0] ?? null, camera ?? null);
    if (mounted.current) { setPreviewStream(camera); setScreenOn(false); }
  }, [negotiateVideo]);

  const toggleScreen = useCallback(async () => {
    if (screenOn) { await stopScreenShare(); return; }
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = screen.getVideoTracks()[0];
      if (!track) { stop(screen); return; }
      screenStreamRef.current = screen;
      track.addEventListener("ended", () => { void stopScreenShare(); }, { once: true });
      setPreviewStream(screen); await negotiateVideo(track, screen); setScreenOn(true);
    } catch { setNotice("Screen sharing was not started. Nothing has been shared."); }
  }, [negotiateVideo, screenOn, stopScreenShare]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; void leave(true); };
  }, [leave]);

  const value = useMemo<CrewVoiceContextValue>(() => ({ activeRoom, activePilot, phase, notice, muted, cameraOn, screenOn, participants, waitingRoomCount, remoteStreams, previewStream, join, leave: () => leave(), toggleMuted, toggleCamera, toggleScreen, previewRoom }), [activePilot, activeRoom, cameraOn, join, leave, muted, notice, participants, phase, previewRoom, previewStream, remoteStreams, screenOn, toggleCamera, toggleMuted, toggleScreen, waitingRoomCount]);

  return <CrewVoiceContext.Provider value={value}>{children}{phase === "connected" && activeRoom && activePilot ? <aside className="crew-voice-dock" aria-label="Active Crew Lounge voice call"><div className="crew-voice-dock-summary"><span className="crew-voice-dock-dot" aria-hidden="true" /><span><strong>In voice · {activeRoom.name}</strong><small>{participants.length}/4 pilots · {muted ? "Muted" : "Microphone on"}</small></span></div><div className="crew-voice-dock-actions"><button type="button" onClick={toggleMuted}>{muted ? "Unmute" : "Mute"}</button><button type="button" onClick={() => void toggleCamera()}>{cameraOn ? "Camera off" : "Camera"}</button><button type="button" onClick={() => void toggleScreen()}>{screenOn ? "Stop share" : "Share"}</button><button type="button" className="leave" onClick={() => void leave()}>Leave</button></div>{Object.entries(remoteStreams).map(([sessionId, stream]) => <RemoteAudio key={sessionId} stream={stream} />)}</aside> : null}</CrewVoiceContext.Provider>;
}

export function useCrewVoice() {
  const context = useContext(CrewVoiceContext);
  if (!context) throw new Error("Crew voice controls must be used within CrewVoiceProvider.");
  return context;
}
